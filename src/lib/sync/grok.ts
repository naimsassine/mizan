import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/encrypt"
import { startOfDay, subDays, eachDayOfInterval, format } from "date-fns"

// Prices per 1M tokens in USD (input / output)
const PRICING: Record<string, { input: number; output: number }> = {
  "grok-3":               { input: 3.0,  output: 15.0 },
  "grok-3-fast":          { input: 5.0,  output: 25.0 },
  "grok-3-mini":          { input: 0.3,  output: 0.5 },
  "grok-3-mini-fast":     { input: 0.6,  output: 4.0 },
  "grok-2-1212":          { input: 2.0,  output: 10.0 },
  "grok-2-latest":        { input: 2.0,  output: 10.0 },
  "grok-2-vision-1212":   { input: 2.0,  output: 10.0 },
  "grok-beta":            { input: 5.0,  output: 15.0 },
  "grok-vision-beta":     { input: 5.0,  output: 15.0 },
}

function modelPrice(model: string) {
  if (PRICING[model]) return PRICING[model]
  const sortedKeys = Object.keys(PRICING).sort((a, b) => b.length - a.length)
  for (const key of sortedKeys) {
    if (model.startsWith(key)) return PRICING[key]
  }
  console.warn(`[mizan] Unknown Grok model pricing: "${model}" — cost stored as $0`)
  return null
}

function calcCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = modelPrice(model)
  if (!p) return 0
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output
}

interface XAIUsageRow {
  model?: string
  date?: string
  input_tokens?: number
  output_tokens?: number
  usage?: { input_tokens?: number; output_tokens?: number }
}

async function fetchGrokDayUsage(
  apiKey: string,
  date: Date,
): Promise<{ model: string; inputTokens: number; outputTokens: number }[] | null> {
  const day = format(startOfDay(date), "yyyy-MM-dd")

  const res = await fetch(
    `https://api.x.ai/v1/usage?start_date=${day}&end_date=${day}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    },
  )

  if (res.status === 401 || res.status === 403) throw new Error("grok_auth")
  if (res.status === 404 || res.status === 405) return [] // no usage API available
  if (!res.ok) throw new Error(`grok_api_${res.status}`)

  const json = await res.json()
  const rows: XAIUsageRow[] = json.data ?? json.usage ?? []

  return rows
    .filter((r) => r.model)
    .map((r) => ({
      model: r.model!,
      inputTokens: r.input_tokens ?? r.usage?.input_tokens ?? 0,
      outputTokens: r.output_tokens ?? r.usage?.output_tokens ?? 0,
    }))
    .filter((r) => r.inputTokens > 0 || r.outputTokens > 0)
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
      date, provider: "grok", model,
      inputTokens: BigInt(inputTokens), outputTokens: BigInt(outputTokens),
      costUsd, source: "api_poll", rawPayload: raw as object,
    },
  })
}

export async function syncGrok(connectionId: string) {
  const connection = await prisma.providerConnection.findUnique({ where: { id: connectionId } })
  if (!connection || connection.provider !== "grok") return

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
      const rows = await fetchGrokDayUsage(apiKey, day)
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
    const isAuthError = err instanceof Error && err.message === "grok_auth"
    await prisma.providerConnection.update({
      where: { id: connectionId },
      data: { status: isAuthError ? "expired" : "error", backfillStatus: "failed" },
    })
  }
}

export async function syncGrokIncremental(connectionId: string) {
  const connection = await prisma.providerConnection.findUnique({ where: { id: connectionId } })
  if (!connection || connection.provider !== "grok" || connection.status !== "active") return

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
      const rows = await fetchGrokDayUsage(credentials.apiKey, day)
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
