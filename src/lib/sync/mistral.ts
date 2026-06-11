import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/encrypt"
import { startOfDay, subDays, eachDayOfInterval, format } from "date-fns"

// Prices per 1M tokens in USD (input / output)
const PRICING: Record<string, { input: number; output: number }> = {
  "mistral-large-latest":          { input: 2.0,  output: 6.0 },
  "mistral-large-2407":            { input: 2.0,  output: 6.0 },
  "mistral-large-2411":            { input: 2.0,  output: 6.0 },
  "mistral-medium-latest":         { input: 0.4,  output: 1.2 },
  "mistral-small-latest":          { input: 0.2,  output: 0.6 },
  "mistral-small-2409":            { input: 0.2,  output: 0.6 },
  "open-mistral-7b":               { input: 0.25, output: 0.25 },
  "mistral-7b-instruct-v0.3":      { input: 0.25, output: 0.25 },
  "open-mixtral-8x7b":             { input: 0.7,  output: 0.7 },
  "open-mixtral-8x22b":            { input: 2.0,  output: 6.0 },
  "codestral-latest":              { input: 1.0,  output: 3.0 },
  "codestral-2405":                { input: 1.0,  output: 3.0 },
  "mistral-embed":                 { input: 0.1,  output: 0.0 },
  "pixtral-large-latest":          { input: 2.0,  output: 6.0 },
  "pixtral-12b-2409":              { input: 0.15, output: 0.15 },
  "ministral-8b-latest":           { input: 0.1,  output: 0.1 },
  "ministral-3b-latest":           { input: 0.04, output: 0.04 },
}

function modelPrice(model: string) {
  if (PRICING[model]) return PRICING[model]
  const sortedKeys = Object.keys(PRICING).sort((a, b) => b.length - a.length)
  for (const key of sortedKeys) {
    if (model.startsWith(key)) return PRICING[key]
  }
  console.warn(`[mizan] Unknown Mistral model pricing: "${model}" — cost stored as $0`)
  return null
}

function calcCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = modelPrice(model)
  if (!p) return 0
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output
}

interface MistralUsageEntry {
  model?: string
  period?: string
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
}

async function fetchMistralDayUsage(
  apiKey: string,
  date: Date,
): Promise<{ model: string; inputTokens: number; outputTokens: number }[] | null> {
  const day = format(startOfDay(date), "yyyy-MM-dd")

  const res = await fetch(
    `https://api.mistral.ai/v1/billing/usage?start_date=${day}&end_date=${day}&group_by=model`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    },
  )

  if (res.status === 401 || res.status === 403) throw new Error("mistral_auth")
  if (res.status === 404 || res.status === 422) return [] // endpoint or date not supported
  if (!res.ok) throw new Error(`mistral_api_${res.status}`)

  const json = await res.json()
  const entries: MistralUsageEntry[] = json.data ?? json.usage ?? json.results ?? []

  return entries
    .filter((e) => e.model && (e.input_tokens || e.output_tokens))
    .map((e) => ({
      model: e.model!,
      inputTokens: e.input_tokens ?? 0,
      outputTokens: e.output_tokens ?? 0,
    }))
}

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
      date, provider: "mistral", model,
      inputTokens: BigInt(inputTokens), outputTokens: BigInt(outputTokens),
      costUsd, source: "api_poll", rawPayload: raw as object,
    },
  })
}

export async function syncMistral(connectionId: string) {
  const connection = await prisma.providerConnection.findUnique({ where: { id: connectionId } })
  if (!connection || connection.provider !== "mistral") return

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
      const rows = await fetchMistralDayUsage(apiKey, day)
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
  } catch (err: unknown) {
    const isAuthError = err instanceof Error && err.message === "mistral_auth"
    await prisma.providerConnection.update({
      where: { id: connectionId },
      data: { status: isAuthError ? "expired" : "error", backfillStatus: "failed" },
    })
  }
}

export async function syncMistralIncremental(connectionId: string) {
  const connection = await prisma.providerConnection.findUnique({ where: { id: connectionId } })
  if (!connection || connection.provider !== "mistral" || connection.status !== "active") return

  let credentials: { apiKey: string }
  try {
    credentials = JSON.parse(decrypt(connection.encCredentials))
  } catch {
    return
  }

  const ownerType = connection.ownerType as "user" | "org"

  try {
    const days = eachDayOfInterval({ start: subDays(new Date(), 3), end: subDays(new Date(), 1) })
    for (const day of days) {
      const rows = await fetchMistralDayUsage(credentials.apiKey, day)
      if (!rows) continue
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
      data: { lastSyncedAt: new Date() },
    })
  } catch {
    // Don't mark as error for incremental failures
  }
}
