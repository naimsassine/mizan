import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/encrypt"
import { startOfDay, subDays } from "date-fns"

// Prices per 1M tokens in USD (input / output)
const PRICING: Record<string, { input: number; output: number }> = {
  // Current Claude 4.x models (2026)
  "claude-fable-5":             { input: 10,   output: 50 },
  "claude-opus-4-8":            { input: 5,    output: 25 },
  "claude-opus-4-7":            { input: 5,    output: 25 },
  "claude-opus-4-6":            { input: 5,    output: 25 },
  "claude-sonnet-4-6":          { input: 3,    output: 15 },
  "claude-haiku-4-5":           { input: 1,    output: 5 },
  // Claude 3.x legacy (may appear in historical data)
  "claude-3-7-sonnet-20250219": { input: 3,    output: 15 },
  "claude-3-5-sonnet-20241022": { input: 3,    output: 15 },
  "claude-3-5-sonnet-20240620": { input: 3,    output: 15 },
  "claude-3-5-haiku-20241022":  { input: 0.8,  output: 4 },
  "claude-3-opus-20240229":     { input: 15,   output: 75 },
  "claude-3-sonnet-20240229":   { input: 3,    output: 15 },
  "claude-3-haiku-20240307":    { input: 0.25, output: 1.25 },
  // Claude 2.x legacy
  "claude-2.1":                 { input: 8,    output: 24 },
  "claude-2.0":                 { input: 8,    output: 24 },
  "claude-instant-1.2":         { input: 0.8,  output: 2.4 },
}

function modelPrice(model: string): { input: number; output: number } | null {
  if (PRICING[model]) return PRICING[model]
  const sortedKeys = Object.keys(PRICING).sort((a, b) => b.length - a.length)
  for (const key of sortedKeys) {
    if (model.startsWith(key)) return PRICING[key]
  }
  console.warn(`[mizan] Unknown Anthropic model pricing: "${model}" — cost stored as $0`)
  return null
}

function calcCost(
  model: string,
  uncachedInput: number,
  cacheCreation: number,
  cacheRead: number,
  outputTokens: number,
): number {
  const p = modelPrice(model)
  if (!p) return 0
  return (
    (uncachedInput / 1_000_000) * p.input +
    (cacheCreation / 1_000_000) * p.input * 1.25 +
    (cacheRead / 1_000_000) * p.input * 0.1 +
    (outputTokens / 1_000_000) * p.output
  )
}

// --- API types ---

type UsageResult = {
  model: string | null
  uncached_input_tokens: number
  cache_read_input_tokens: number
  cache_creation: {
    ephemeral_1h_input_tokens: number
    ephemeral_5m_input_tokens: number
  } | null
  output_tokens: number
}

type UsageBucket = {
  starting_at: string
  ending_at: string
  results: UsageResult[]
}

type UsageResponse = {
  data: UsageBucket[]
  has_more: boolean
  next_page: string | null
}

// --- Usage fetch ---

async function fetchAnthropicUsage(
  apiKey: string,
  connectionId: string,
  ownerId: string,
  ownerType: "user" | "org",
  from: Date,
  to: Date,
): Promise<boolean> {
  let page: string | undefined

  while (true) {
    const url = new URL("https://api.anthropic.com/v1/organizations/usage_report/messages")
    url.searchParams.set("starting_at", startOfDay(from).toISOString())
    url.searchParams.set("ending_at", to.toISOString())
    url.searchParams.set("bucket_width", "1d")
    url.searchParams.append("group_by[]", "model")
    url.searchParams.set("limit", "31")
    if (page) url.searchParams.set("page", page)

    const res = await fetch(url.toString(), {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    })

    if (res.status === 401 || res.status === 403) return false
    if (res.status === 404 || res.status === 405) return true
    if (!res.ok) throw new Error(`Anthropic Usage API ${res.status}`)

    const payload: UsageResponse = await res.json()

    for (const bucket of payload.data) {
      const date = startOfDay(new Date(bucket.starting_at))
      for (const row of bucket.results) {
        if (!row.model) continue
        const uncachedInput = row.uncached_input_tokens ?? 0
        const cacheRead = row.cache_read_input_tokens ?? 0
        const cacheCreation =
          (row.cache_creation?.ephemeral_1h_input_tokens ?? 0) +
          (row.cache_creation?.ephemeral_5m_input_tokens ?? 0)
        const outputTokens = row.output_tokens ?? 0
        const inputTokens = uncachedInput + cacheRead + cacheCreation
        if (inputTokens === 0 && outputTokens === 0) continue

        const costUsd = calcCost(row.model, uncachedInput, cacheCreation, cacheRead, outputTokens)
        await upsertRecord({
          connectionId, ownerId, ownerType, date,
          model: row.model, inputTokens, outputTokens, costUsd, raw: row,
        })
      }
    }

    if (!payload.has_more || !payload.next_page) break
    page = payload.next_page
  }

  return true
}

// --- Upsert helper ---

async function upsertRecord({
  connectionId, ownerId, ownerType, date, model, inputTokens, outputTokens, costUsd, raw,
}: {
  connectionId: string
  ownerId: string
  ownerType: "user" | "org"
  date: Date
  model: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  raw: unknown
}) {
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

// Daily incremental sync (last 3 days) — called by cron
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
  const to = new Date()
  const ownerType = connection.ownerType as "user" | "org"

  try {
    await fetchAnthropicUsage(credentials.apiKey, connectionId, connection.ownerId, ownerType, from, to)
    await prisma.providerConnection.update({
      where: { id: connectionId },
      data: { lastSyncedAt: new Date() },
    })
  } catch {
    // Don't mark as error for incremental failures — just skip
  }
}
