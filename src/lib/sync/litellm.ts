import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/encrypt"
import { startOfDay, subDays, eachDayOfInterval, format } from "date-fns"

// LiteLLM is a self-hosted proxy — baseUrl varies per deployment.
// Credentials stored as { baseUrl: "https://...", apiKey: "sk-..." }
// We poll /spend/logs with date filters and aggregate by day + model.

interface SpendLog {
  model?: string
  spend?: number
  total_cost?: number
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  startTime?: string
  start_time?: string
}

async function fetchSpendLogs(
  baseUrl: string,
  apiKey: string,
  date: Date,
): Promise<{ model: string; inputTokens: number; outputTokens: number; costUsd: number }[]> {
  const day = format(startOfDay(date), "yyyy-MM-dd")
  const nextDay = format(startOfDay(subDays(new Date(date.getTime() + 86_400_000), 0)), "yyyy-MM-dd")

  const cleanBase = baseUrl.replace(/\/$/, "")
  const url = `${cleanBase}/spend/logs?start_date=${day}&end_date=${nextDay}`

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  })

  if (res.status === 401 || res.status === 403) throw new Error("litellm_auth")
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`litellm_api_${res.status}`)

  const json = await res.json()
  const logs: SpendLog[] = Array.isArray(json) ? json : (json.data ?? json.logs ?? [])

  const byModel = new Map<string, { inputTokens: number; outputTokens: number; costUsd: number }>()

  for (const log of logs) {
    const model = log.model
    if (!model) continue
    const cur = byModel.get(model) ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 }
    cur.inputTokens += log.prompt_tokens ?? 0
    cur.outputTokens += log.completion_tokens ?? 0
    cur.costUsd += log.spend ?? log.total_cost ?? 0
    byModel.set(model, cur)
  }

  return Array.from(byModel.entries())
    .filter(([, v]) => v.inputTokens > 0 || v.outputTokens > 0 || v.costUsd > 0)
    .map(([model, v]) => ({ model, ...v }))
}

async function upsertRecord({
  connectionId, ownerId, ownerType, date, model, inputTokens, outputTokens, costUsd,
}: {
  connectionId: string
  ownerId: string
  ownerType: "user" | "org"
  date: Date
  model: string
  inputTokens: number
  outputTokens: number
  costUsd: number
}) {
  await prisma.usageRecord.upsert({
    where: { connectionId_date_model: { connectionId, date, model } },
    update: { inputTokens: BigInt(inputTokens), outputTokens: BigInt(outputTokens), costUsd },
    create: {
      connectionId, ownerId, ownerType,
      date, provider: "litellm", model,
      inputTokens: BigInt(inputTokens), outputTokens: BigInt(outputTokens),
      costUsd, source: "api_poll",
    },
  })
}

export async function syncLiteLLM(connectionId: string) {
  const connection = await prisma.providerConnection.findUnique({ where: { id: connectionId } })
  if (!connection || connection.provider !== "litellm") return

  let credentials: { baseUrl: string; apiKey: string }
  try {
    credentials = JSON.parse(decrypt(connection.encCredentials))
  } catch {
    await prisma.providerConnection.update({ where: { id: connectionId }, data: { status: "error" } })
    return
  }

  const { baseUrl, apiKey } = credentials
  if (!baseUrl || !apiKey) {
    await prisma.providerConnection.update({ where: { id: connectionId }, data: { status: "error" } })
    return
  }

  const ownerType = connection.ownerType as "user" | "org"

  await prisma.providerConnection.update({
    where: { id: connectionId },
    data: { backfillStatus: "in_progress" },
  })

  try {
    const days = eachDayOfInterval({ start: connection.backfillFrom, end: subDays(new Date(), 1) })
    for (const day of days) {
      const rows = await fetchSpendLogs(baseUrl, apiKey, day)
      for (const row of rows) {
        await upsertRecord({
          connectionId, ownerId: connection.ownerId, ownerType,
          date: startOfDay(day), model: row.model,
          inputTokens: row.inputTokens, outputTokens: row.outputTokens, costUsd: row.costUsd,
        })
      }
    }

    await prisma.providerConnection.update({
      where: { id: connectionId },
      data: { status: "active", backfillStatus: "complete", lastSyncedAt: new Date() },
    })
  } catch (err) {
    const isAuth = err instanceof Error && err.message === "litellm_auth"
    await prisma.providerConnection.update({
      where: { id: connectionId },
      data: { status: isAuth ? "expired" : "error", backfillStatus: "failed" },
    })
  }
}

export async function syncLiteLLMIncremental(connectionId: string) {
  const connection = await prisma.providerConnection.findUnique({ where: { id: connectionId } })
  if (!connection || connection.provider !== "litellm" || connection.status !== "active") return

  let credentials: { baseUrl: string; apiKey: string }
  try {
    credentials = JSON.parse(decrypt(connection.encCredentials))
  } catch {
    return
  }

  const { baseUrl, apiKey } = credentials
  if (!baseUrl || !apiKey) return

  const yesterday = subDays(new Date(), 1)
  const ownerType = connection.ownerType as "user" | "org"

  try {
    const rows = await fetchSpendLogs(baseUrl, apiKey, yesterday)
    for (const row of rows) {
      await upsertRecord({
        connectionId, ownerId: connection.ownerId, ownerType,
        date: startOfDay(yesterday), model: row.model,
        inputTokens: row.inputTokens, outputTokens: row.outputTokens, costUsd: row.costUsd,
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
