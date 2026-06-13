import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/encrypt"
import { startOfDay, parseISO } from "date-fns"

// GET /api/v1/activity — returns last 30 days of usage, grouped by model per day.
// No pagination needed; max history is 30 completed UTC days.

interface ORActivityRow {
  date: string                  // "YYYY-MM-DD HH:MM:SS" UTC
  model: string                 // e.g. "anthropic/claude-opus-4-8"
  usage: number                 // OpenRouter credits spent (USD)
  byok_usage_inference: number  // BYOK inference cost (USD)
  prompt_tokens: number
  completion_tokens: number
  reasoning_tokens?: number
}

interface ORActivityResponse {
  data: ORActivityRow[]
}

async function fetchActivity(apiKey: string): Promise<ORActivityRow[]> {
  const res = await fetch("https://openrouter.ai/api/v1/activity", {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  })

  if (res.status === 401 || res.status === 403) throw new Error("openrouter_auth")
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`openrouter_api_${res.status}`)

  const json: ORActivityResponse = await res.json()
  return json.data ?? []
}

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
      date, provider: "openrouter", model,
      inputTokens: BigInt(inputTokens), outputTokens: BigInt(outputTokens),
      costUsd, source: "api_poll", rawPayload: raw as object,
    },
  })
}

async function syncFromActivity(
  apiKey: string,
  connectionId: string,
  ownerId: string,
  ownerType: "user" | "org",
): Promise<boolean> {
  const rows = await fetchActivity(apiKey)

  for (const row of rows) {
    if (!row.model) continue
    const inputTokens = row.prompt_tokens ?? 0
    const outputTokens = (row.completion_tokens ?? 0) + (row.reasoning_tokens ?? 0)
    const costUsd = (row.usage ?? 0) + (row.byok_usage_inference ?? 0)
    if (inputTokens === 0 && outputTokens === 0 && costUsd === 0) continue

    // Date comes as "YYYY-MM-DD HH:MM:SS" UTC — parse the date portion only
    const dateStr = row.date.split(" ")[0]
    const date = startOfDay(parseISO(dateStr))

    await upsertRecord({ connectionId, ownerId, ownerType, date, model: row.model, inputTokens, outputTokens, costUsd, raw: row })
  }

  return true
}

export async function syncOpenRouter(connectionId: string) {
  const connection = await prisma.providerConnection.findUnique({ where: { id: connectionId } })
  if (!connection || connection.provider !== "openrouter") return

  let credentials: { apiKey: string }
  try {
    credentials = JSON.parse(decrypt(connection.encCredentials))
  } catch {
    await prisma.providerConnection.update({ where: { id: connectionId }, data: { status: "error" } })
    return
  }

  const ownerType = connection.ownerType as "user" | "org"

  await prisma.providerConnection.update({
    where: { id: connectionId },
    data: { backfillStatus: "in_progress" },
  })

  try {
    await syncFromActivity(credentials.apiKey, connectionId, connection.ownerId, ownerType)

    await prisma.providerConnection.update({
      where: { id: connectionId },
      data: { status: "active", backfillStatus: "complete", lastSyncedAt: new Date() },
    })
  } catch (err) {
    const isAuth = err instanceof Error && err.message === "openrouter_auth"
    await prisma.providerConnection.update({
      where: { id: connectionId },
      data: { status: isAuth ? "expired" : "error", backfillStatus: "failed" },
    })
  }
}

export async function syncOpenRouterIncremental(connectionId: string) {
  const connection = await prisma.providerConnection.findUnique({ where: { id: connectionId } })
  if (!connection || connection.provider !== "openrouter" || connection.status !== "active") return

  let credentials: { apiKey: string }
  try {
    credentials = JSON.parse(decrypt(connection.encCredentials))
  } catch {
    return
  }

  const ownerType = connection.ownerType as "user" | "org"

  try {
    await syncFromActivity(credentials.apiKey, connectionId, connection.ownerId, ownerType)
    await prisma.providerConnection.update({
      where: { id: connectionId },
      data: { lastSyncedAt: new Date() },
    })
  } catch {
    // Don't mark as error for incremental failures
  }
}
