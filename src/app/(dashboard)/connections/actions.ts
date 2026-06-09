"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"
import { after } from "next/server"
import { subMonths, startOfDay } from "date-fns"
import { prisma } from "@/lib/prisma"
import { encrypt } from "@/lib/encrypt"
import { syncOpenAI, syncOpenAIIncremental } from "@/lib/sync/openai"
import { syncAnthropic, syncAnthropicIncremental } from "@/lib/sync/anthropic"
import { syncGemini, syncGeminiIncremental } from "@/lib/sync/gemini"
import { syncBedrock, syncBedrockIncremental } from "@/lib/sync/bedrock"

// isBedrock=true means credValue is already a JSON string of { accessKeyId, secretAccessKey, region }
// Otherwise credValue is a plain API key string
export async function createConnection(provider: string, credValue: string, isBedrock = false) {
  const { userId, orgId } = await auth()
  if (!userId) return { error: "Unauthorized" }

  const validProviders = ["openai", "anthropic", "gemini", "bedrock"]
  if (!validProviders.includes(provider)) return { error: "Invalid provider" }
  if (!credValue.trim()) return { error: "Credentials are required" }

  const ownerId = orgId ?? userId
  const ownerType = orgId ? "org" : "user"

  const credJson = isBedrock ? credValue : JSON.stringify({ apiKey: credValue })

  let connectionId: string
  try {
    const connection = await prisma.providerConnection.create({
      data: {
        ownerId,
        ownerType: ownerType as "user" | "org",
        provider: provider as "openai" | "anthropic" | "gemini" | "bedrock",
        encCredentials: encrypt(credJson),
        backfillFrom: startOfDay(subMonths(new Date(), 3)),
        backfillStatus: "pending",
      },
    })
    connectionId = connection.id
  } catch {
    return { error: "Failed to save connection. Please try again." }
  }

  after(async () => {
    if (provider === "openai") await syncOpenAI(connectionId)
    else if (provider === "anthropic") await syncAnthropic(connectionId)
    else if (provider === "gemini") await syncGemini(connectionId)
    else if (provider === "bedrock") await syncBedrock(connectionId)
  })

  revalidatePath("/connections")
  revalidatePath("/overview")
  return { error: null }
}

export async function triggerSync(connectionId: string) {
  const { userId, orgId } = await auth()
  if (!userId) return { error: "Unauthorized" }

  const ownerId = orgId ?? userId
  const connection = await prisma.providerConnection.findFirst({
    where: { id: connectionId, ownerId },
  })
  if (!connection) return { error: "Not found" }

  after(async () => {
    if (connection.provider === "openai") await syncOpenAIIncremental(connectionId)
    else if (connection.provider === "anthropic") await syncAnthropicIncremental(connectionId)
    else if (connection.provider === "gemini") await syncGeminiIncremental(connectionId)
    else if (connection.provider === "bedrock") await syncBedrockIncremental(connectionId)
  })

  revalidatePath("/connections")
  revalidatePath("/overview")
  return { error: null }
}

export async function deleteConnection(id: string) {
  const { userId, orgId } = await auth()
  if (!userId) return { error: "Unauthorized" }

  const ownerId = orgId ?? userId
  await prisma.providerConnection.deleteMany({ where: { id, ownerId } })

  revalidatePath("/connections")
  revalidatePath("/overview")
  return { error: null }
}

export async function updateGcpProject(connectionId: string, projectId: string) {
  const { userId, orgId } = await auth()
  if (!userId) return { error: "Unauthorized" }

  const ownerId = orgId ?? userId
  const conn = await prisma.providerConnection.findFirst({
    where: { id: connectionId, ownerId, provider: "gemini" },
  })
  if (!conn) return { error: "Not found" }

  await prisma.providerConnection.update({
    where: { id: connectionId },
    data: { gcpProjectId: projectId.trim() },
  })

  after(async () => {
    const { syncGemini } = await import("@/lib/sync/gemini")
    await syncGemini(connectionId)
  })

  revalidatePath("/connections")
  return { error: null }
}
