import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/encrypt"
import { subDays } from "date-fns"

// Gemini (AI Studio) API keys grant inference access only — there is no
// usage-history endpoint on generativelanguage.googleapis.com.
// Full billing data requires a Google Cloud service-account key with
// Cloud Billing API access (future OAuth flow). For now we verify the key
// works and mark the connection active; no UsageRecords are created.

async function verifyGeminiKey(apiKey: string): Promise<boolean> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=1`
  )
  return res.ok
}

export async function syncGemini(connectionId: string) {
  const connection = await prisma.providerConnection.findUnique({ where: { id: connectionId } })
  if (!connection || connection.provider !== "gemini") return

  let credentials: { apiKey: string }
  try {
    credentials = JSON.parse(decrypt(connection.encCredentials))
  } catch {
    await prisma.providerConnection.update({ where: { id: connectionId }, data: { status: "error" } })
    return
  }

  await prisma.providerConnection.update({
    where: { id: connectionId },
    data: { backfillStatus: "in_progress" },
  })

  try {
    const valid = await verifyGeminiKey(credentials.apiKey)
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

  let credentials: { apiKey: string }
  try {
    credentials = JSON.parse(decrypt(connection.encCredentials))
  } catch {
    return
  }

  try {
    const valid = await verifyGeminiKey(credentials.apiKey)
    if (!valid) {
      await prisma.providerConnection.update({ where: { id: connectionId }, data: { status: "error" } })
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
