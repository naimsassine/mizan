import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/encrypt"
import { startOfDay, subDays, eachDayOfInterval, format, parseISO } from "date-fns"

// OpenRouter returns actual USD costs per request — no pricing table needed.
// Token counts come from native_tokens_prompt / native_tokens_completion.

interface ORGeneration {
  id: string
  model: string
  created_at: string
  native_tokens_prompt?: number
  native_tokens_completion?: number
  total_cost?: number
}

interface ORResponse {
  data: ORGeneration[]
  meta?: { total_count?: number }
}

async function fetchGenerationsPage(
  apiKey: string,
  date: Date,
  offset: number,
): Promise<ORResponse | null> {
  const day = format(startOfDay(date), "yyyy-MM-dd")
  const url = new URL("https://openrouter.ai/api/v1/generation")
  url.searchParams.set("date_min", day)
  url.searchParams.set("date_max", day)
  url.searchParams.set("limit", "1000")
  url.searchParams.set("offset", String(offset))

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  })

  if (res.status === 401 || res.status === 403) throw new Error("openrouter_auth")
  if (res.status === 404) return { data: [] }
  if (!res.ok) throw new Error(`openrouter_api_${res.status}`)
  return res.json()
}

async function fetchDayUsage(
  apiKey: string,
  date: Date,
): Promise<{ model: string; inputTokens: number; outputTokens: number; costUsd: number }[]> {
  const byModel = new Map<string, { inputTokens: number; outputTokens: number; costUsd: number }>()
  let offset = 0

  while (true) {
    const page = await fetchGenerationsPage(apiKey, date, offset)
    if (!page || page.data.length === 0) break

    for (const gen of page.data) {
      if (!gen.model) continue
      const cur = byModel.get(gen.model) ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 }
      cur.inputTokens += gen.native_tokens_prompt ?? 0
      cur.outputTokens += gen.native_tokens_completion ?? 0
      cur.costUsd += gen.total_cost ?? 0
      byModel.set(gen.model, cur)
    }

    const totalCount = page.meta?.total_count ?? page.data.length
    offset += page.data.length
    if (offset >= totalCount || page.data.length < 1000) break
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
      date, provider: "openrouter", model,
      inputTokens: BigInt(inputTokens), outputTokens: BigInt(outputTokens),
      costUsd, source: "api_poll",
    },
  })
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

  const { apiKey } = credentials
  const ownerType = connection.ownerType as "user" | "org"

  await prisma.providerConnection.update({
    where: { id: connectionId },
    data: { backfillStatus: "in_progress" },
  })

  try {
    const days = eachDayOfInterval({ start: connection.backfillFrom, end: subDays(new Date(), 1) })
    for (const day of days) {
      const rows = await fetchDayUsage(apiKey, day)
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
    const days = eachDayOfInterval({ start: subDays(new Date(), 3), end: subDays(new Date(), 1) })
    for (const day of days) {
      const rows = await fetchDayUsage(credentials.apiKey, day)
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
      data: { lastSyncedAt: new Date() },
    })
  } catch {
    // Don't mark as error for incremental failures
  }
}
