"use server"

import { revalidatePath } from "next/cache"
import { after } from "next/server"
import { subMonths, startOfDay } from "date-fns"
import { prisma } from "@/lib/prisma"
import { getOwner } from "@/lib/owner"
import { DEMO_DISABLED } from "@/lib/demo"
import { encrypt } from "@/lib/encrypt"
import { revalidateOwnerSpend } from "@/lib/cache"
import { syncOpenAI, syncOpenAIIncremental } from "@/lib/sync/openai"
import { syncAnthropic, syncAnthropicIncremental } from "@/lib/sync/anthropic"
import { syncGemini, syncGeminiIncremental } from "@/lib/sync/gemini"
import { syncBedrock, syncBedrockIncremental } from "@/lib/sync/bedrock"
import { syncGroq, syncGroqIncremental } from "@/lib/sync/groq"
import { syncMistral, syncMistralIncremental } from "@/lib/sync/mistral"
import { syncGrok, syncGrokIncremental } from "@/lib/sync/grok"
import { syncOpenRouter, syncOpenRouterIncremental } from "@/lib/sync/openrouter"
import { syncLiteLLM, syncLiteLLMIncremental } from "@/lib/sync/litellm"

// isJsonCreds=true means credValue is already a JSON string (used for Bedrock and LiteLLM)
// Otherwise credValue is a plain API key string
export async function createConnection(provider: string, credValue: string, isJsonCreds = false) {
  const { userId, orgId, orgRole, isDemo } = await getOwner()
  if (isDemo) return DEMO_DISABLED
  if (!userId) return { error: "Unauthorized" }
  if (orgId && orgRole === "org:viewer") return { error: "Viewers cannot add connections" }

  const validProviders = ["openai", "anthropic", "gemini", "bedrock", "groq", "mistral", "grok", "openrouter", "litellm"]
  if (!validProviders.includes(provider)) return { error: "Invalid provider" }
  if (!credValue.trim()) return { error: "Credentials are required" }

  const ownerId = orgId ?? userId
  const ownerType = orgId ? "org" : "user"

  const credJson = isJsonCreds ? credValue : JSON.stringify({ apiKey: credValue })

  // Read backfill months from settings — fall back to 3 months if not configured
  let backfillMonths = 3
  if (orgId) {
    const orgSettings = await prisma.orgSettings.findUnique({ where: { clerkOrgId: orgId }, select: { backfillMonths: true } })
    backfillMonths = orgSettings?.backfillMonths ?? 3
  } else {
    const userSettings = await prisma.userSettings.findUnique({ where: { clerkUserId: userId }, select: { backfillMonths: true } })
    backfillMonths = userSettings?.backfillMonths ?? 3
  }

  let connectionId: string
  try {
    const connection = await prisma.providerConnection.create({
      data: {
        ownerId,
        ownerType: ownerType as "user" | "org",
        provider: provider as "openai" | "anthropic" | "gemini" | "bedrock" | "groq" | "mistral" | "grok" | "openrouter" | "litellm",
        encCredentials: encrypt(credJson),
        backfillFrom: startOfDay(subMonths(new Date(), backfillMonths)),
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
    else if (provider === "groq") await syncGroq(connectionId)
    else if (provider === "mistral") await syncMistral(connectionId)
    else if (provider === "grok") await syncGrok(connectionId)
    else if (provider === "openrouter") await syncOpenRouter(connectionId)
    else if (provider === "litellm") await syncLiteLLM(connectionId)
    // Backfill wrote new usage rows — drop cached aggregates so dashboards reflect them.
    revalidateOwnerSpend(ownerId)
  })

  revalidatePath("/connections")
  revalidatePath("/overview")
  return { error: null }
}

export async function triggerSync(connectionId: string) {
  const { userId, orgId, isDemo } = await getOwner()
  if (isDemo) return DEMO_DISABLED
  if (!userId) return { error: "Unauthorized" }

  const ownerId = orgId ?? userId
  const connection = await prisma.providerConnection.findFirst({
    where: { id: connectionId, ownerId },
  })
  if (!connection) return { error: "Not found" }

  after(async () => {
    // Use full sync for errored/expired connections so the status-active guard in Incremental doesn't bail
    const fullSync = connection.status !== "active"
    if (connection.provider === "openai") await (fullSync ? syncOpenAI : syncOpenAIIncremental)(connectionId)
    else if (connection.provider === "anthropic") await (fullSync ? syncAnthropic : syncAnthropicIncremental)(connectionId)
    else if (connection.provider === "gemini") await (fullSync ? syncGemini : syncGeminiIncremental)(connectionId)
    else if (connection.provider === "bedrock") await (fullSync ? syncBedrock : syncBedrockIncremental)(connectionId)
    else if (connection.provider === "groq") await (fullSync ? syncGroq : syncGroqIncremental)(connectionId)
    else if (connection.provider === "mistral") await (fullSync ? syncMistral : syncMistralIncremental)(connectionId)
    else if (connection.provider === "grok") await (fullSync ? syncGrok : syncGrokIncremental)(connectionId)
    else if (connection.provider === "openrouter") await (fullSync ? syncOpenRouter : syncOpenRouterIncremental)(connectionId)
    else if (connection.provider === "litellm") await (fullSync ? syncLiteLLM : syncLiteLLMIncremental)(connectionId)
    revalidateOwnerSpend(ownerId)
  })

  revalidatePath("/connections")
  revalidatePath("/overview")
  return { error: null }
}

export async function deleteConnection(id: string) {
  const { userId, orgId, orgRole, isDemo } = await getOwner()
  if (isDemo) return DEMO_DISABLED
  if (!userId) return { error: "Unauthorized" }
  if (orgId && orgRole === "org:viewer") return { error: "Viewers cannot delete connections" }

  const ownerId = orgId ?? userId
  await prisma.providerConnection.deleteMany({ where: { id, ownerId } })
  // Cascade removed this connection's usage rows — refresh cached aggregates.
  revalidateOwnerSpend(ownerId)

  revalidatePath("/connections")
  revalidatePath("/overview")
  return { error: null }
}

export async function updateGcpProject(connectionId: string, projectId: string) {
  const { userId, orgId, isDemo } = await getOwner()
  if (isDemo) return DEMO_DISABLED
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
    revalidateOwnerSpend(ownerId)
  })

  revalidatePath("/connections")
  return { error: null }
}
