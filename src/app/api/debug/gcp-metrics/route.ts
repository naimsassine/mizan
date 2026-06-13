import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { decrypt, encrypt } from "@/lib/encrypt"

const MONITORING_API = "https://monitoring.googleapis.com/v3"

async function getFreshToken(connectionId: string): Promise<string> {
  const conn = await prisma.providerConnection.findUnique({ where: { id: connectionId } })
  if (!conn) throw new Error("Connection not found")

  const creds = JSON.parse(decrypt(conn.encCredentials)) as {
    accessToken: string
    refreshToken: string
    expiresAt: number
  }

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
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`)
  const data = await res.json()
  const updated = { ...creds, accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
  await prisma.providerConnection.update({
    where: { id: connectionId },
    data: { encCredentials: encrypt(JSON.stringify(updated)) },
  })
  return updated.accessToken
}

export async function GET() {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ownerId = orgId ?? userId

  const conn = await prisma.providerConnection.findFirst({
    where: { ownerId, provider: "gemini" },
    select: { id: true, gcpProjectId: true },
  })

  if (!conn?.gcpProjectId || conn.gcpProjectId === "PENDING") {
    return NextResponse.json({ error: "No Gemini connection with project ID found" })
  }

  const { id, gcpProjectId } = conn

  let accessToken: string
  try {
    accessToken = await getFreshToken(id)
  } catch (e) {
    return NextResponse.json({ error: `Token error: ${String(e)}` })
  }

  // List all metric descriptors matching AI-related prefixes
  const prefixes = ["aiplatform.googleapis.com", "generativelanguage.googleapis.com"]
  const results: Record<string, unknown[]> = {}

  for (const prefix of prefixes) {
    const params = new URLSearchParams({ filter: `metric.type = starts_with("${prefix}")` })
    const res = await fetch(
      `${MONITORING_API}/projects/${gcpProjectId}/metricDescriptors?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (!res.ok) {
      results[prefix] = [{ error: res.status, body: await res.text() }]
    } else {
      const data = await res.json()
      results[prefix] = ((data.metricDescriptors ?? []) as { type: string; description?: string }[]).map(
        (d) => ({ type: d.type, description: d.description }),
      )
    }
  }

  // Also run the exact query we normally use, to see if it errors or returns empty
  const now = new Date()
  const queryParams = new URLSearchParams({
    filter: `metric.type="aiplatform.googleapis.com/publisher/online_serving/token_count"`,
    "interval.startTime": new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    "interval.endTime": now.toISOString(),
    "aggregation.alignmentPeriod": "86400s",
    "aggregation.perSeriesAligner": "ALIGN_SUM",
  })
  const tsRes = await fetch(
    `${MONITORING_API}/projects/${gcpProjectId}/timeSeries?${queryParams}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  const tsBody = tsRes.ok ? await tsRes.json() : { error: tsRes.status, body: await tsRes.text() }

  // Fetch full descriptor for the Gemini API token metric to see its labels
  const glMetric = "generativelanguage.googleapis.com/generate_content_usage_output_token_count"
  const descRes = await fetch(
    `${MONITORING_API}/projects/${gcpProjectId}/metricDescriptors/${encodeURIComponent(glMetric)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  const glDescriptor = descRes.ok ? await descRes.json() : { error: descRes.status, body: await descRes.text() }

  // Query the Gemini API metric with no grouping so we can see raw label values
  const glParams = new URLSearchParams({
    filter: `metric.type="${glMetric}"`,
    "interval.startTime": new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    "interval.endTime": now.toISOString(),
    "aggregation.alignmentPeriod": "86400s",
    "aggregation.perSeriesAligner": "ALIGN_SUM",
  })
  const glRes = await fetch(
    `${MONITORING_API}/projects/${gcpProjectId}/timeSeries?${glParams}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  const glData = glRes.ok ? await glRes.json() : { error: glRes.status, body: await glRes.text() }

  return NextResponse.json({
    projectId: gcpProjectId,
    geminiApiMetricDescriptor: glDescriptor,
    geminiApiTokenData: glData,
    vertexTokenCountQueryResult: tsBody,
  })
}
