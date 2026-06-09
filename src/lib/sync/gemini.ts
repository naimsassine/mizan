import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/encrypt"
import { syncVertex } from "./vertex"

// AI Studio API keys grant inference access only — no usage-history endpoint.
// For real usage data, connect via Google Cloud OAuth (Vertex AI), which uses
// the Cloud Monitoring API. syncGemini() detects which credential type is stored
// and delegates accordingly.

async function verifyGeminiKey(apiKey: string): Promise<boolean> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=1`,
  )
  return res.ok
}

function isOAuthCredentials(creds: unknown): boolean {
  return (
    typeof creds === "object" &&
    creds !== null &&
    "accessToken" in creds &&
    "refreshToken" in creds
  )
}

export async function syncGemini(connectionId: string) {
  const connection = await prisma.providerConnection.findUnique({ where: { id: connectionId } })
  if (!connection || connection.provider !== "gemini") return

  let credentials: unknown
  try {
    credentials = JSON.parse(decrypt(connection.encCredentials))
  } catch {
    await prisma.providerConnection.update({
      where: { id: connectionId },
      data: { status: "error" },
    })
    return
  }

  if (isOAuthCredentials(credentials)) {
    return syncVertex(connectionId, true)
  }

  // API key path — verify only
  await prisma.providerConnection.update({
    where: { id: connectionId },
    data: { backfillStatus: "in_progress" },
  })

  try {
    const valid = await verifyGeminiKey((credentials as { apiKey: string }).apiKey)
    await prisma.providerConnection.update({
      where: { id: connectionId },
      data: {
        status: valid ? "active" : "error",
        backfillStatus: "complete",
        lastSyncedAt: new Date(),
      },
    })
  } catch {
    await prisma.providerConnection.update({
      where: { id: connectionId },
      data: { status: "error", backfillStatus: "failed" },
    })
  }
}

export async function syncGeminiIncremental(connectionId: string) {
  const connection = await prisma.providerConnection.findUnique({ where: { id: connectionId } })
  if (!connection || connection.provider !== "gemini" || connection.status !== "active") return

  let credentials: unknown
  try {
    credentials = JSON.parse(decrypt(connection.encCredentials))
  } catch {
    return
  }

  if (isOAuthCredentials(credentials)) {
    return syncVertex(connectionId, false)
  }

  try {
    const valid = await verifyGeminiKey((credentials as { apiKey: string }).apiKey)
    if (!valid) {
      await prisma.providerConnection.update({
        where: { id: connectionId },
        data: { status: "error" },
      })
      return
    }
    await prisma.providerConnection.update({
      where: { id: connectionId },
      data: { lastSyncedAt: new Date() },
    })
  } catch {
    // skip on incremental failures
  }
}
