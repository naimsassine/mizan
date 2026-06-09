import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/encrypt"
import { startOfDay, subDays, eachDayOfInterval } from "date-fns"

// Prices per 1M tokens in USD (input / output)
const PRICING: Record<string, { input: number; output: number }> = {
  "llama-3.3-70b-versatile":        { input: 0.59, output: 0.79 },
  "llama-3.1-70b-versatile":        { input: 0.59, output: 0.79 },
  "llama-3.1-8b-instant":           { input: 0.05, output: 0.08 },
  "llama3-70b-8192":                { input: 0.59, output: 0.79 },
  "llama3-8b-8192":                 { input: 0.05, output: 0.08 },
  "llama-3.2-1b-preview":           { input: 0.04, output: 0.04 },
  "llama-3.2-3b-preview":           { input: 0.06, output: 0.06 },
  "llama-3.2-11b-vision-preview":   { input: 0.18, output: 0.18 },
  "llama-3.2-90b-vision-preview":   { input: 0.90, output: 0.90 },
  "llama-guard-3-8b":               { input: 0.20, output: 0.20 },
  "mixtral-8x7b-32768":             { input: 0.24, output: 0.24 },
  "gemma-7b-it":                    { input: 0.07, output: 0.07 },
  "gemma2-9b-it":                   { input: 0.20, output: 0.20 },
}

function modelPrice(model: string) {
  if (PRICING[model]) return PRICING[model]
  for (const [key, p] of Object.entries(PRICING)) {
    if (model.startsWith(key)) return p
  }
  console.warn(`[mizan] Unknown Groq model pricing: "${model}" — cost stored as $0`)
  return null
}

function calcCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = modelPrice(model)
  if (!p) return 0
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output
}

// --- Prometheus HTTP API types ---

interface PrometheusResult {
  metric: Record<string, string>
  values: [number, string][]
}

interface PrometheusResponse {
  status: string
  data: { resultType: string; result: PrometheusResult[] }
}

// Query Groq's Prometheus-compatible metrics API for a single day.
// The rate5m metrics are per-second rates; multiplying by 300 (step) gives tokens per 5-min window.
async function fetchGroqDayUsage(
  apiKey: string,
  date: Date,
): Promise<{ model: string; inputTokens: number; outputTokens: number }[] | null> {
  const dayStart = startOfDay(date)
  const dayEnd = startOfDay(subDays(date, -1)) // next day midnight

  const startTs = Math.floor(dayStart.getTime() / 1000)
  const endTs = Math.floor(dayEnd.getTime() / 1000)
  const step = 300 // 5 min

  const base = "https://api.groq.com/v1/metrics/prometheus/api/v1/query_range"

  async function queryMetric(metric: string): Promise<PrometheusResult[]> {
    const url = `${base}?query=sum+by+(model)(${encodeURIComponent(metric)})&start=${startTs}&end=${endTs}&step=${step}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (res.status === 403 || res.status === 401) throw new Error(`groq_auth_${res.status}`)
    if (!res.ok) throw new Error(`groq_api_${res.status}`)
    const json: PrometheusResponse = await res.json()
    if (json.status !== "success") throw new Error("groq_api_error")
    return json.data.result
  }

  const [inputResults, outputResults] = await Promise.all([
    queryMetric("model_project_id:tokens_in:rate5m"),
    queryMetric("model_project_id:tokens_out:rate5m"),
  ])

  // Accumulate per-model token totals (rate * 300s = tokens in that 5-min window)
  const totals = new Map<string, { inputTokens: number; outputTokens: number }>()

  for (const series of inputResults) {
    const model = series.metric.model
    if (!model) continue
    const tokens = series.values.reduce((sum, [, v]) => sum + parseFloat(v) * step, 0)
    const entry = totals.get(model) ?? { inputTokens: 0, outputTokens: 0 }
    entry.inputTokens += Math.round(tokens)
    totals.set(model, entry)
  }

  for (const series of outputResults) {
    const model = series.metric.model
    if (!model) continue
    const tokens = series.values.reduce((sum, [, v]) => sum + parseFloat(v) * step, 0)
    const entry = totals.get(model) ?? { inputTokens: 0, outputTokens: 0 }
    entry.outputTokens += Math.round(tokens)
    totals.set(model, entry)
  }

  return Array.from(totals.entries())
    .filter(([, v]) => v.inputTokens > 0 || v.outputTokens > 0)
    .map(([model, v]) => ({ model, ...v }))
}

// --- Upsert helper ---

async function upsertRecord({
  connectionId, ownerId, ownerType, date, model, inputTokens, outputTokens, raw,
}: {
  connectionId: string
  ownerId: string
  ownerType: "user" | "org"
  date: Date
  model: string
  inputTokens: number
  outputTokens: number
  raw: unknown
}) {
  const costUsd = calcCost(model, inputTokens, outputTokens)
  await prisma.usageRecord.upsert({
    where: { connectionId_date_model: { connectionId, date, model } },
    update: { inputTokens: BigInt(inputTokens), outputTokens: BigInt(outputTokens), costUsd },
    create: {
      connectionId, ownerId, ownerType,
      date, provider: "groq", model,
      inputTokens: BigInt(inputTokens), outputTokens: BigInt(outputTokens),
      costUsd, source: "api_poll", rawPayload: raw as object,
    },
  })
}

// --- Main entry points ---

export async function syncGroq(connectionId: string) {
  const connection = await prisma.providerConnection.findUnique({ where: { id: connectionId } })
  if (!connection || connection.provider !== "groq") return

  let credentials: { apiKey: string }
  try {
    credentials = JSON.parse(decrypt(connection.encCredentials))
  } catch {
    await prisma.providerConnection.update({ where: { id: connectionId }, data: { status: "error" } })
    return
  }

  const { apiKey } = credentials
  const ownerType = connection.ownerType as "user" | "org"

  await prisma.providerConnection.update({
    where: { id: connectionId },
    data: { backfillStatus: "in_progress" },
  })

  try {
    const days = eachDayOfInterval({ start: connection.backfillFrom, end: subDays(new Date(), 1) })

    for (const day of days) {
      const rows = await fetchGroqDayUsage(apiKey, day)
      if (rows === null) {
        await prisma.providerConnection.update({
          where: { id: connectionId },
          data: { status: "error", backfillStatus: "failed" },
        })
        return
      }
      for (const row of rows) {
        await upsertRecord({
          connectionId, ownerId: connection.ownerId, ownerType,
          date: startOfDay(day), model: row.model,
          inputTokens: row.inputTokens, outputTokens: row.outputTokens,
          raw: row,
        })
      }
    }

    await prisma.providerConnection.update({
      where: { id: connectionId },
      data: { status: "active", backfillStatus: "complete", lastSyncedAt: new Date() },
    })
  } catch {
    await prisma.providerConnection.update({
      where: { id: connectionId },
      data: { status: "error", backfillStatus: "failed" },
    })
  }
}

export async function syncGroqIncremental(connectionId: string) {
  const connection = await prisma.providerConnection.findUnique({ where: { id: connectionId } })
  if (!connection || connection.provider !== "groq" || connection.status !== "active") return

  let credentials: { apiKey: string }
  try {
    credentials = JSON.parse(decrypt(connection.encCredentials))
  } catch {
    return
  }

  const yesterday = subDays(new Date(), 1)
  const ownerType = connection.ownerType as "user" | "org"

  try {
    const rows = await fetchGroqDayUsage(credentials.apiKey, yesterday)
    if (!rows) return
    for (const row of rows) {
      await upsertRecord({
        connectionId, ownerId: connection.ownerId, ownerType,
        date: startOfDay(yesterday), model: row.model,
        inputTokens: row.inputTokens, outputTokens: row.outputTokens,
        raw: row,
      })
    }
    await prisma.providerConnection.update({
      where: { id: connectionId },
      data: { lastSyncedAt: new Date() },
    })
  } catch {
    // Don't mark as error for incremental failures
  }
}
