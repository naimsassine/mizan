"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"
import { subMonths, startOfDay } from "date-fns"
import { prisma } from "@/lib/prisma"
import { encrypt } from "@/lib/encrypt"

export async function createConnection(provider: string, apiKey: string) {
  const { userId, orgId } = await auth()
  if (!userId) return { error: "Unauthorized" }

  const validProviders = ["openai", "anthropic", "gemini", "bedrock"]
  if (!validProviders.includes(provider)) return { error: "Invalid provider" }
  if (!apiKey.trim()) return { error: "API key is required" }

  const ownerId = orgId ?? userId
  const ownerType = orgId ? "org" : "user"

  try {
    await prisma.providerConnection.create({
      data: {
        ownerId,
        ownerType: ownerType as "user" | "org",
        provider: provider as "openai" | "anthropic" | "gemini" | "bedrock",
        encCredentials: encrypt(JSON.stringify({ apiKey })),
        backfillFrom: startOfDay(subMonths(new Date(), 3)),
        backfillStatus: "pending",
      },
    })
  } catch {
    return { error: "Failed to save connection. Please try again." }
  }

  revalidatePath("/connections")
  revalidatePath("/overview")
  return { error: null }
}

export async function deleteConnection(id: string) {
  const { userId, orgId } = await auth()
  if (!userId) return { error: "Unauthorized" }

  const ownerId = orgId ?? userId

  await prisma.providerConnection.deleteMany({
    where: { id, ownerId },
  })

  revalidatePath("/connections")
  revalidatePath("/overview")
  return { error: null }
}
