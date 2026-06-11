import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/encrypt"
import { format, startOfDay, subDays } from "date-fns"

// Prices per 1M tokens in USD (input / output)
const PRICING: Record<string, { input: number; output: number }> = {
  // Current Claude 4.x models (2026)
  "claude-opus-4-8":           { input: 5,    output: 25 },
  "claude-opus-4-7":           { input: 5,    output: 25 },
  "claude-opus-4-6":           { input: 5,    output: 25 },
  "claude-sonnet-4-6":         { input: 3,    output: 15 },
  "claude-haiku-4-5":          { input: 1,    output: 5 },
  // Claude 3.x legacy (may appear in historical data)
  "claude-3-7-sonnet-20250219":{ input: 3,    output: 15 },
  "claude-3-5-sonnet-20241022":{ input: 3,    output: 15 },
  "claude-3-5-sonnet-20240620":{ input: 3,    output: 15 },
  "claude-3-5-haiku-20241022": { input: 0.8,  output: 4 },
  "claude-3-opus-20240229":    { input: 15,   output: 75 },
  "claude-3-sonnet-20240229":  { input: 3,    output: 15 },
  "claude-3-haiku-20240307":   { input: 0.25, output: 1.25 },
  // Claude 2.x legacy
  "claude-2.1":                { input: 8,    output: 24 },
  "claude-2.0":                { input: 8,    output: 24 },
  "claude-instant-1.2":        { input: 0.8,  output: 2.4 },
}

function modelPrice(model: string): { input: number; output: number } | null {
  if (PRICING[model]) return PRICING[model]
  // longest-prefix match: "claude-opus-4-8-20260101" → "claude-opus-4-8" not "claude-opus-4"
  const sortedKeys = Object.keys(PRICING).sort((a, b) => b.length - a.length)
  for (const key of sortedKeys) {
    if (model.startsWith(key)) return PRICING[key]
  }
  console.warn(`[mizan] Unknown Anthropic model pricing: "${model}" — cost stored as $0`)
  return null
}

function calcCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = modelPrice(model)
  if (!p) return 0
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output
}

// --- Usage fetch ---

type UsageRow = {
  model?: string
  date?: string
  input_tokens?: number
  output_tokens?: number
  usage?: { input_tokens?: number; output_tokens?: number }
}

async function fetchAnthropicUsage(
  apiKey: string,
  connectionId: string,
  ownerId: string,
  ownerType: "user" | "org",
  from: Date,
  to: Date
): Promise<boolean> {
  let afterId: string | undefined

  while (true) {
    const url = new URL("https://api.anthropic.com/v1/usage")
    url.searchParams.set("start_date", format(startOfDay(from), "yyyy-MM-dd"))
    url.searchParams.set("end_date", format(startOfDay(to), "yyyy-MM-dd"))
    if (afterId) url.searchParams.set("after_id", afterId)

    const res = await fetch(url.toString(), {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    })

    if (res.status === 401 || res.status === 403) return false
    // Endpoint unavailable — treat as no data rather than a hard error
    if (res.status === 404 || res.status === 405) return true
    if (!res.ok) throw new Error(`Anthropic Usage API ${res.status}`)

    const payload: { data?: UsageRow[]; usage?: UsageRow[]; has_more?: boolean; last_id?: string } = await res.json()
    const rows = payload.data ?? payload.usage ?? []

    for (const row of rows) {
      if (!row.model) continue
      const inputTokens = row.input_tokens ?? row.usage?.input_tokens ?? 0
      const outputTokens = row.output_tokens ?? row.usage?.output_tokens ?? 0
      if (inputTokens === 0 && outputTokens === 0) continue

      const date = row.date ? startOfDay(new Date(row.date)) : startOfDay(from)
      await upsertRecord({ connectionId, ownerId, ownerType, date, model: row.model, inputTokens, outputTokens, raw: row })
    }

    if (!payload.has_more || !payload.last_id) break
    afterId = payload.last_id
  }

  return true
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
      date, provider: "anthropic", model,
      inputTokens: BigInt(inputTokens), outputTokens: BigInt(outputTokens),
      costUsd, source: "api_poll", rawPayload: raw as object,
    },
  })
}

// --- Main entry point ---

export async function syncAnthropic(connectionId: string) {
  const connection = await prisma.providerConnection.findUnique({ where: { id: connectionId } })
  if (!connection || connection.provider !== "anthropic") return

  let credentials: { apiKey: string }
  try {
    credentials = JSON.parse(decrypt(connection.encCredentials))
  } catch {
    await prisma.providerConnection.update({ where: { id: connectionId }, data: { status: "error" } })
    return
  }

  const { apiKey } = credentials
  const ownerType = connection.ownerType as "user" | "org"
  const from = connection.backfillFrom
  const to = new Date()

  await prisma.providerConnection.update({
    where: { id: connectionId },
    data: { backfillStatus: "in_progress" },
  })

  try {
    const ok = await fetchAnthropicUsage(apiKey, connectionId, connection.ownerId, ownerType, from, to)
    if (!ok) {
      await prisma.providerConnection.update({
        where: { id: connectionId },
        data: { status: "expired", backfillStatus: "failed" },
      })
      return
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

// Daily incremental sync (yesterday only) — called by cron
export async function syncAnthropicIncremental(connectionId: string) {
  const connection = await prisma.providerConnection.findUnique({ where: { id: connectionId } })
  if (!connection || connection.provider !== "anthropic" || connection.status !== "active") return

  let credentials: { apiKey: string }
  try {
    credentials = JSON.parse(decrypt(connection.encCredentials))
  } catch {
    return
  }

  const from = subDays(new Date(), 3)
  const yesterday = subDays(new Date(), 1)
  const ownerType = connection.ownerType as "user" | "org"

  try {
    await fetchAnthropicUsage(credentials.apiKey, connectionId, connection.ownerId, ownerType, from, yesterday)
    await prisma.providerConnection.update({
      where: { id: connectionId },
      data: { lastSyncedAt: new Date() },
    })
  } catch {
    // Don't mark as error for incremental failures — just skip
  }
}
