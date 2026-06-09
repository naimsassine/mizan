import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/encrypt"
import { startOfDay, subDays, eachDayOfInterval, format } from "date-fns"

// Prices per 1M tokens in USD (input / output) — Moonshot AI pricing
const PRICING: Record<string, { input: number; output: number }> = {
  "moonshot-v1-8k":      { input: 0.14, output: 0.14 },
  "moonshot-v1-32k":     { input: 0.28, output: 0.28 },
  "moonshot-v1-128k":    { input: 0.84, output: 0.84 },
  "kimi-k1-5":           { input: 0.14, output: 0.14 },
  "kimi-k1-5-long":      { input: 0.84, output: 0.84 },
  "moonshot-v1-auto":    { input: 0.28, output: 0.28 },
}

function modelPrice(model: string) {
  if (PRICING[model]) return PRICING[model]
  for (const [key, p] of Object.entries(PRICING)) {
    if (model.startsWith(key)) return p
  }
  console.warn(`[mizan] Unknown Kimi model pricing: "${model}" — cost stored as $0`)
  return null
}

function calcCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = modelPrice(model)
  if (!p) return 0
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output
}

interface KimiUsageRow {
  model?: string
  date?: string
  input_tokens?: number
  output_tokens?: number
  prompt_tokens?: number
  completion_tokens?: number
}

async function fetchKimiDayUsage(
  apiKey: string,
  date: Date,
): Promise<{ model: string; inputTokens: number; outputTokens: number }[] | null> {
  const day = format(startOfDay(date), "yyyy-MM-dd")

  const res = await fetch(
    `https://api.moonshot.cn/v1/billing/usage?start_date=${day}&end_date=${day}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    },
  )

  if (res.status === 401 || res.status === 403) throw new Error("kimi_auth")
  if (res.status === 404 || res.status === 405) return [] // no usage API available
  if (!res.ok) throw new Error(`kimi_api_${res.status}`)

  const json = await res.json()
  const rows: KimiUsageRow[] = json.data ?? json.usage ?? []

  return rows
    .filter((r) => r.model)
    .map((r) => ({
      model: r.model!,
      inputTokens: r.input_tokens ?? r.prompt_tokens ?? 0,
      outputTokens: r.output_tokens ?? r.completion_tokens ?? 0,
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
      date, provider: "kimi", model,
      inputTokens: BigInt(inputTokens), outputTokens: BigInt(outputTokens),
      costUsd, source: "api_poll", rawPayload: raw as object,
    },
  })
}

export async function syncKimi(connectionId: string) {
  const connection = await prisma.providerConnection.findUnique({ where: { id: connectionId } })
  if (!connection || connection.provider !== "kimi") return

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
      const rows = await fetchKimiDayUsage(apiKey, day)
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
    const isAuthError = err instanceof Error && err.message === "kimi_auth"
    await prisma.providerConnection.update({
      where: { id: connectionId },
      data: { status: isAuthError ? "error" : "error", backfillStatus: "failed" },
    })
  }
}

export async function syncKimiIncremental(connectionId: string) {
  const connection = await prisma.providerConnection.findUnique({ where: { id: connectionId } })
  if (!connection || connection.provider !== "kimi" || connection.status !== "active") return

  let credentials: { apiKey: string }
  try {
    credentials = JSON.parse(decrypt(connection.encCredentials))
  } catch {
    return
  }

  const yesterday = subDays(new Date(), 1)
  const ownerType = connection.ownerType as "user" | "org"

  try {
    const rows = await fetchKimiDayUsage(credentials.apiKey, yesterday)
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
