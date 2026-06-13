import { prisma } from "@/lib/prisma"
import { decrypt, encrypt } from "@/lib/encrypt"
import { subDays, startOfDay, endOfDay } from "date-fns"
import { fetchGeminiPricing, type ModelPricing } from "./gemini-pricing"

const MONITORING_API = "https://monitoring.googleapis.com/v3"

// Vertex AI (aiplatform endpoint) — has both input and output token labels
const VERTEX_TOKEN_METRIC = "aiplatform.googleapis.com/publisher/online_serving/token_count"

// Gemini API / AI Studio (generativelanguage endpoint) — output tokens only
const GL_OUTPUT_TOKEN_METRIC =
  "generativelanguage.googleapis.com/generate_content_usage_output_token_count"

// Static fallback pricing per 1M tokens (USD), used when billing catalog is unavailable
const FALLBACK_PRICING: Record<string, ModelPricing> = {
  "gemini-2.5-pro":      { input: 1.25,   output: 10.0 },
  "gemini-2.5-flash":    { input: 0.15,   output: 0.60 },
  "gemini-2.0-flash":    { input: 0.10,   output: 0.40 },
  "gemini-2.0-flash-lite": { input: 0.075, output: 0.30 },
  "gemini-1.5-pro":      { input: 1.25,   output: 5.00 },
  "gemini-1.5-flash":    { input: 0.075,  output: 0.30 },
  "gemini-1.5-flash-8b": { input: 0.0375, output: 0.15 },
  "gemini-1.0-pro":      { input: 0.50,   output: 1.50 },
}

function priceFor(
  modelId: string,
  livePricing: Record<string, ModelPricing>,
): ModelPricing {
  const base = modelId
    .replace(/publishers\/google\/models\//, "")
    .replace(/-\d{3}$/, "")
    .toLowerCase()
  return livePricing[base] ?? FALLBACK_PRICING[base] ?? { input: 0, output: 0 }
}

interface VertexCredentials {
  accessToken: string
  refreshToken: string
  expiresAt: number
  projectId?: string
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

async function queryTimeSeries(
  accessToken: string,
  projectId: string,
  metricType: string,
  startTime: Date,
  endTime: Date,
  groupByFields: string[],
): Promise<TimeSeries[]> {
  const params = new URLSearchParams({
    filter: `metric.type="${metricType}"`,
    "interval.startTime": startTime.toISOString(),
    "interval.endTime": endTime.toISOString(),
    "aggregation.alignmentPeriod": "86400s",
    "aggregation.perSeriesAligner": "ALIGN_SUM",
    "aggregation.crossSeriesReducer": "REDUCE_SUM",
  })
  for (const f of groupByFields) params.append("aggregation.groupByFields", f)

  const url = `${MONITORING_API}/projects/${projectId}/timeSeries?${params}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) {
    const body = await res.text()
    console.error(`[mizan/vertex] ${metricType} ${res.status}:`, body.slice(0, 500))
    return []
  }
  const data = await res.json()
  const series = (data.timeSeries ?? []) as TimeSeries[]
  console.log(`[mizan/vertex] ${metricType}: ${series.length} series (project: ${projectId})`)
  return series
}

async function upsertDayData(
  connectionId: string,
  ownerId: string,
  ownerType: "user" | "org",
  date: Date,
  model: string,
  inputTokens: bigint,
  outputTokens: bigint,
  livePricing: Record<string, ModelPricing>,
) {
  const p = priceFor(model, livePricing)
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
  const connection = await prisma.providerConnection.findUnique({ where: { id: connectionId } })
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
    const rangeStart = startOfDay(startDate)
    const rangeEnd = endOfDay(endDate)

    // Fetch live pricing from GCP Billing Catalog (cached 24h); falls back to static table
    const livePricing = await fetchGeminiPricing()

    // Try Vertex AI metric first (aiplatform endpoint, has input+output split)
    let series = await queryTimeSeries(
      accessToken,
      connection.gcpProjectId,
      VERTEX_TOKEN_METRIC,
      rangeStart,
      rangeEnd,
      ["metric.labels.model_user_id", "metric.labels.type"],
    )
    let isGeminiApi = false

    // If no Vertex AI data, fall back to Gemini API / AI Studio metric (output only)
    if (series.length === 0) {
      series = await queryTimeSeries(
        accessToken,
        connection.gcpProjectId,
        GL_OUTPUT_TOKEN_METRIC,
        rangeStart,
        rangeEnd,
        ["metric.labels.model"],
      )
      isGeminiApi = true
    }

    // Accumulate per-day per-model token counts
    const dayMap = new Map<string, Map<string, { input: bigint; output: bigint }>>()

    for (const ts of series) {
      const modelId = isGeminiApi
        ? (ts.metric.labels.model ?? "gemini")
        : (ts.metric.labels.model_user_id ?? ts.metric.labels.model_id ?? "unknown")

      // Vertex AI series are split by type label (INPUT/OUTPUT); Gemini API is all output
      const isInput =
        !isGeminiApi && (ts.metric.labels.type ?? "").toUpperCase() === "INPUT"

      for (const point of ts.points) {
        // Use UTC date from the interval start
        const day = new Date(point.interval.startTime).toISOString().slice(0, 10)
        if (!dayMap.has(day)) dayMap.set(day, new Map())
        const models = dayMap.get(day)!
        if (!models.has(modelId)) models.set(modelId, { input: 0n, output: 0n })
        const entry = models.get(modelId)!
        const count = BigInt(point.value.int64Value ?? 0)
        if (isInput) entry.input += count
        else entry.output += count
      }
    }

    const { ownerId, ownerType } = connection
    for (const [day, models] of dayMap) {
      for (const [model, { input, output }] of models) {
        await upsertDayData(connectionId, ownerId, ownerType, new Date(day), model, input, output, livePricing)
      }
    }

    await prisma.providerConnection.update({
      where: { id: connectionId },
      data: { status: "active", backfillStatus: "complete", lastSyncedAt: now },
    })
  } catch (err) {
    console.error("[mizan/vertex] sync failed:", err)
    await prisma.providerConnection.update({
      where: { id: connectionId },
      data: { status: "error", backfillStatus: "failed" },
    })
  }
}
