import { prisma } from "@/lib/prisma"
import { decrypt, encrypt } from "@/lib/encrypt"
import { format, subDays, eachDayOfInterval, startOfDay, endOfDay } from "date-fns"

const MONITORING_API = "https://monitoring.googleapis.com/v3"
const TOKEN_METRIC = "aiplatform.googleapis.com/publisher/online_serving/token_count"

// Vertex AI pricing per 1M tokens (USD)
const VERTEX_PRICING: Record<string, { input: number; output: number }> = {
  "gemini-2.5-pro": { input: 1.25, output: 10.0 },
  "gemini-2.5-flash": { input: 0.15, output: 0.60 },
  "gemini-2.0-flash": { input: 0.10, output: 0.40 },
  "gemini-2.0-flash-lite": { input: 0.075, output: 0.30 },
  "gemini-1.5-pro": { input: 1.25, output: 5.00 },
  "gemini-1.5-flash": { input: 0.075, output: 0.30 },
  "gemini-1.5-flash-8b": { input: 0.0375, output: 0.15 },
  "gemini-1.0-pro": { input: 0.50, output: 1.50 },
}

function priceFor(modelId: string): { input: number; output: number } {
  // Strip version suffix e.g. "gemini-1.5-pro-001" → "gemini-1.5-pro"
  const base = modelId
    .replace(/publishers\/google\/models\//, "")
    .replace(/-\d{3}$/, "")
    .toLowerCase()
  if (VERTEX_PRICING[base]) return VERTEX_PRICING[base]
  console.warn(`[mizan] Unknown Vertex model pricing: "${modelId}" — cost stored as $0`)
  return { input: 0, output: 0 }
}

interface VertexCredentials {
  accessToken: string
  refreshToken: string
  expiresAt: number
  projectId: string
}

async function getAccessToken(connectionId: string): Promise<string> {
  const conn = await prisma.providerConnection.findUnique({ where: { id: connectionId } })
  if (!conn) throw new Error("Connection not found")

  const creds: VertexCredentials = JSON.parse(decrypt(conn.encCredentials))

  if (Date.now() < creds.expiresAt - 60_000) return creds.accessToken

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: creds.refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  })
  if (!res.ok) throw new Error("Token refresh failed")
  const data = await res.json()

  const updated: VertexCredentials = {
    ...creds,
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in as number) * 1000,
  }
  await prisma.providerConnection.update({
    where: { id: connectionId },
    data: { encCredentials: encrypt(JSON.stringify(updated)) },
  })
  return updated.accessToken
}

interface TimeSeriesPoint {
  interval: { startTime: string; endTime: string }
  value: { int64Value?: string; doubleValue?: number }
}

interface TimeSeries {
  metric: { labels: Record<string, string> }
  points: TimeSeriesPoint[]
}

async function queryTokens(
  accessToken: string,
  projectId: string,
  startTime: Date,
  endTime: Date,
): Promise<TimeSeries[]> {
  const params = new URLSearchParams({
    filter: `metric.type="${TOKEN_METRIC}"`,
    "interval.startTime": startTime.toISOString(),
    "interval.endTime": endTime.toISOString(),
    "aggregation.alignmentPeriod": "86400s",
    "aggregation.perSeriesAligner": "ALIGN_SUM",
    "aggregation.crossSeriesReducer": "REDUCE_SUM",
    "aggregation.groupByFields": "metric.labels.model_user_id,metric.labels.type",
  })

  const res = await fetch(
    `${MONITORING_API}/projects/${projectId}/timeSeries?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!res.ok) return []
  const data = await res.json()
  return (data.timeSeries ?? []) as TimeSeries[]
}

async function upsertDayData(
  connectionId: string,
  ownerId: string,
  ownerType: "user" | "org",
  date: Date,
  model: string,
  inputTokens: bigint,
  outputTokens: bigint,
) {
  const p = priceFor(model)
  const costUsd =
    (Number(inputTokens) / 1_000_000) * p.input +
    (Number(outputTokens) / 1_000_000) * p.output

  await prisma.usageRecord.upsert({
    where: { connectionId_date_model: { connectionId, date, model } },
    update: { inputTokens, outputTokens, costUsd },
    create: {
      connectionId,
      ownerId,
      ownerType,
      date,
      provider: "gemini",
      model,
      inputTokens,
      outputTokens,
      costUsd,
      source: "api_poll",
    },
  })
}

export async function syncVertex(connectionId: string, backfill = false) {
  const connection = await prisma.providerConnection.findUnique({
    where: { id: connectionId },
  })
  if (!connection || !connection.gcpProjectId || connection.gcpProjectId === "PENDING") return

  let accessToken: string
  try {
    accessToken = await getAccessToken(connectionId)
  } catch {
    await prisma.providerConnection.update({
      where: { id: connectionId },
      data: { status: "error" },
    })
    return
  }

  await prisma.providerConnection.update({
    where: { id: connectionId },
    data: { backfillStatus: "in_progress" },
  })

  try {
    const now = new Date()
    const startDate = backfill ? connection.backfillFrom : subDays(now, 3)
    const endDate = subDays(now, 1)

    const series = await queryTokens(
      accessToken,
      connection.gcpProjectId,
      startOfDay(startDate),
      endOfDay(endDate),
    )

    // Collect per-day per-model input/output token counts
    const dayMap = new Map<string, Map<string, { input: bigint; output: bigint }>>()

    for (const ts of series) {
      const modelId =
        ts.metric.labels.model_user_id ??
        ts.metric.labels.model_id ??
        "unknown"
      const tokenType = (ts.metric.labels.type ?? "INPUT").toUpperCase()
      const isInput = tokenType === "INPUT"

      for (const point of ts.points) {
        const day = format(new Date(point.interval.startTime), "yyyy-MM-dd")
        if (!dayMap.has(day)) dayMap.set(day, new Map())
        const models = dayMap.get(day)!
        if (!models.has(modelId)) models.set(modelId, { input: 0n, output: 0n })
        const entry = models.get(modelId)!
        const count = BigInt(point.value.int64Value ?? 0)
        if (isInput) entry.input += count
        else entry.output += count
      }
    }

    const ownerId = connection.ownerId
    const ownerType = connection.ownerType

    for (const [day, models] of dayMap) {
      for (const [model, { input, output }] of models) {
        await upsertDayData(connectionId, ownerId, ownerType, new Date(day), model, input, output)
      }
    }

    await prisma.providerConnection.update({
      where: { id: connectionId },
      data: {
        status: "active",
        backfillStatus: "complete",
        lastSyncedAt: now,
      },
    })
  } catch {
    await prisma.providerConnection.update({
      where: { id: connectionId },
      data: { status: "error", backfillStatus: "failed" },
    })
  }
}
