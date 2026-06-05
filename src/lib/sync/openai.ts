import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/encrypt"
import { eachDayOfInterval, format, getUnixTime, startOfDay, endOfDay, subDays } from "date-fns"

// Prices per 1M tokens in USD (input / output)
const PRICING: Record<string, { input: number; output: number }> = {
  // GPT-4.1 family (Apr 2025)
  "gpt-4.1":                   { input: 2,    output: 8 },
  "gpt-4.1-mini":              { input: 0.4,  output: 1.6 },
  "gpt-4.1-nano":              { input: 0.1,  output: 0.4 },
  // GPT-4o family
  "gpt-4o":                    { input: 2.5,  output: 10 },
  "gpt-4o-2024-11-20":         { input: 2.5,  output: 10 },
  "gpt-4o-2024-08-06":         { input: 2.5,  output: 10 },
  "gpt-4o-2024-05-13":         { input: 5,    output: 15 },
  "gpt-4o-mini":               { input: 0.15, output: 0.6 },
  "gpt-4o-mini-2024-07-18":    { input: 0.15, output: 0.6 },
  // GPT-4.5 (experimental/preview — higher cost)
  "gpt-4.5-preview":           { input: 75,   output: 150 },
  // GPT-4 Turbo / GPT-4
  "gpt-4-turbo":               { input: 10,   output: 30 },
  "gpt-4-turbo-2024-04-09":    { input: 10,   output: 30 },
  "gpt-4-turbo-preview":       { input: 10,   output: 30 },
  "gpt-4":                     { input: 30,   output: 60 },
  "gpt-4-0613":                { input: 30,   output: 60 },
  // GPT-3.5
  "gpt-3.5-turbo":             { input: 0.5,  output: 1.5 },
  "gpt-3.5-turbo-0125":        { input: 0.5,  output: 1.5 },
  "gpt-3.5-turbo-instruct":    { input: 1.5,  output: 2 },
  // o-series reasoning models
  "o1":                        { input: 15,   output: 60 },
  "o1-2024-12-17":             { input: 15,   output: 60 },
  "o1-mini":                   { input: 3,    output: 12 },
  "o1-mini-2024-09-12":        { input: 3,    output: 12 },
  "o1-preview":                { input: 15,   output: 60 },
  "o1-pro":                    { input: 150,  output: 600 },
  "o3":                        { input: 10,   output: 40 },
  "o3-mini":                   { input: 1.1,  output: 4.4 },
  "o4-mini":                   { input: 1.1,  output: 4.4 },
  // Embeddings
  "text-embedding-3-small":    { input: 0.02, output: 0 },
  "text-embedding-3-large":    { input: 0.13, output: 0 },
  "text-embedding-ada-002":    { input: 0.1,  output: 0 },
}

// Models whose cost cannot be estimated — stored at $0 with raw payload intact
const UNPRICED_PREFIXES = ["dall-e", "tts", "whisper", "babbage", "davinci", "curie", "ada-"]

function modelPrice(model: string): { input: number; output: number } | null {
  if (PRICING[model]) return PRICING[model]
  // prefix match: "gpt-4.1-2025-..." → gpt-4.1
  for (const [key, p] of Object.entries(PRICING)) {
    if (model.startsWith(key)) return p
  }
  // Models we explicitly can't price (non-completion APIs)
  if (UNPRICED_PREFIXES.some((pfx) => model.startsWith(pfx))) return null
  // Unknown model — log once so the pricing table can be updated
  console.warn(`[mizan] Unknown OpenAI model pricing: "${model}" — cost stored as $0`)
  return null
}

function calcCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = modelPrice(model)
  if (!p) return 0
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output
}

// --- Admin API (new, paginated) ---

async function fetchAdminUsage(
  apiKey: string,
  connectionId: string,
  ownerId: string,
  ownerType: "user" | "org",
  from: Date,
  to: Date
): Promise<boolean> {
  const startTime = getUnixTime(startOfDay(from))
  const endTime = getUnixTime(endOfDay(to))

  let page: string | undefined
  let hasMore = true

  while (hasMore) {
    const url = new URL("https://api.openai.com/v1/organization/usage/completions")
    url.searchParams.set("start_time", String(startTime))
    url.searchParams.set("end_time", String(endTime))
    url.searchParams.set("bucket_width", "1d")
    url.searchParams.append("group_by[]", "model")
    if (page) url.searchParams.set("page", page)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    if (res.status === 401 || res.status === 403) return false // key doesn't have access
    if (!res.ok) throw new Error(`OpenAI Admin API ${res.status}`)

    const data: {
      data: Array<{ start_time: number; results: Array<{ model?: string; input_tokens?: number; output_tokens?: number }> }>
      has_more: boolean
      next_page?: string
    } = await res.json()

    for (const bucket of data.data ?? []) {
      const date = startOfDay(new Date(bucket.start_time * 1000))
      for (const row of bucket.results ?? []) {
        if (!row.model) continue
        const inputTokens = row.input_tokens ?? 0
        const outputTokens = row.output_tokens ?? 0
        if (inputTokens === 0 && outputTokens === 0) continue
        await upsertRecord({ connectionId, ownerId, ownerType, date, model: row.model, inputTokens, outputTokens, raw: row })
      }
    }

    hasMore = data.has_more ?? false
    page = data.next_page ?? undefined
  }

  return true
}

// --- Legacy API (day-by-day, works with regular API keys) ---

async function fetchLegacyUsage(
  apiKey: string,
  connectionId: string,
  ownerId: string,
  ownerType: "user" | "org",
  from: Date,
  to: Date
) {
  const days = eachDayOfInterval({ start: from, end: to })

  for (const day of days) {
    const dateStr = format(day, "yyyy-MM-dd")
    const res = await fetch(`https://api.openai.com/v1/usage?date=${dateStr}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    if (!res.ok) continue // skip individual day errors

    const data: {
      data?: Array<{ snapshot_id?: string; n_context_tokens_total?: number; n_generated_tokens_total?: number }>
    } = await res.json()

    for (const row of data.data ?? []) {
      if (!row.snapshot_id) continue
      const inputTokens = row.n_context_tokens_total ?? 0
      const outputTokens = row.n_generated_tokens_total ?? 0
      if (inputTokens === 0 && outputTokens === 0) continue
      await upsertRecord({ connectionId, ownerId, ownerType, date: startOfDay(day), model: row.snapshot_id, inputTokens, outputTokens, raw: row })
    }
  }
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
      date, provider: "openai", model,
      inputTokens: BigInt(inputTokens), outputTokens: BigInt(outputTokens),
      costUsd, source: "api_poll", rawPayload: raw as object,
    },
  })
}

// --- Main entry point ---

export async function syncOpenAI(connectionId: string) {
  const connection = await prisma.providerConnection.findUnique({ where: { id: connectionId } })
  if (!connection || connection.provider !== "openai") return

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
    // Try Admin API first; fall back to legacy if key lacks org permissions
    const adminWorked = await fetchAdminUsage(apiKey, connectionId, connection.ownerId, ownerType, from, to)
    if (!adminWorked) {
      await fetchLegacyUsage(apiKey, connectionId, connection.ownerId, ownerType, from, to)
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
export async function syncOpenAIIncremental(connectionId: string) {
  const connection = await prisma.providerConnection.findUnique({ where: { id: connectionId } })
  if (!connection || connection.provider !== "openai" || connection.status !== "active") return

  let credentials: { apiKey: string }
  try {
    credentials = JSON.parse(decrypt(connection.encCredentials))
  } catch {
    return
  }

  const yesterday = subDays(new Date(), 1)
  const ownerType = connection.ownerType as "user" | "org"

  try {
    const adminWorked = await fetchAdminUsage(credentials.apiKey, connectionId, connection.ownerId, ownerType, yesterday, yesterday)
    if (!adminWorked) {
      await fetchLegacyUsage(credentials.apiKey, connectionId, connection.ownerId, ownerType, yesterday, yesterday)
    }
    await prisma.providerConnection.update({
      where: { id: connectionId },
      data: { lastSyncedAt: new Date() },
    })
  } catch {
    // Don't mark as error for incremental failures — just skip
  }
}
