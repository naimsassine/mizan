"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"

const VALID_PROVIDERS = ["openai", "anthropic", "gemini", "bedrock", "groq", "mistral", "grok", "openrouter", "litellm"]

export async function createBudgetRule(formData: FormData) {
  const { userId, orgId, orgRole } = await auth()
  if (!userId) return { error: "Unauthorized" }
  if (orgId && orgRole === "org:viewer") return { error: "Viewers cannot create budget rules" }

  const ownerId = orgId ?? userId
  const ownerType = orgId ? "org" : "user"

  const period = formData.get("period") as string
  const limitUsd = parseFloat(formData.get("limitUsd") as string)
  const alertAtPct = parseInt(formData.get("alertAtPct") as string) || 80
  const provider = (formData.get("provider") as string) || null

  if (!["daily", "weekly", "monthly"].includes(period)) return { error: "Invalid period" }
  if (isNaN(limitUsd) || limitUsd <= 0) return { error: "Limit must be a positive number" }
  if (alertAtPct < 1 || alertAtPct > 100) return { error: "Alert threshold must be 1–100" }

  await prisma.budgetRule.create({
    data: {
      ownerId,
      ownerType: ownerType as "user" | "org",
      period: period as "daily" | "weekly" | "monthly",
      limitUsd,
      alertAtPct,
      provider:
        provider && provider !== "all"
          ? (provider as "openai" | "anthropic" | "gemini" | "bedrock" | "groq" | "mistral" | "grok" | "openrouter" | "litellm")
          : null,
    },
  })

  revalidatePath("/notifications")
  return { error: null }
}

export async function deleteBudgetRule(id: string) {
  const { userId, orgId, orgRole } = await auth()
  if (!userId) return { error: "Unauthorized" }
  if (orgId && orgRole === "org:viewer") return { error: "Viewers cannot delete budget rules" }

  const ownerId = orgId ?? userId
  await prisma.budgetRule.deleteMany({ where: { id, ownerId } })
  revalidatePath("/notifications")
  return { error: null }
}

export async function acknowledgeAlert(id: string) {
  const { userId, orgId } = await auth()
  if (!userId) return { error: "Unauthorized" }

  const ownerId = orgId ?? userId

  const alert = await prisma.alert.findUnique({
    where: { id },
    include: { budgetRule: { select: { ownerId: true } } },
  })
  if (!alert || alert.budgetRule.ownerId !== ownerId) return { error: "Not found" }

  await prisma.alert.update({
    where: { id },
    data: { acknowledgedAt: new Date() },
  })

  revalidatePath("/notifications")
  return { error: null }
}

export async function saveDigestSettings(data: {
  weeklyDigest: boolean
  weeklyDigestDay: number
  weeklyDigestProviders: string[]
}) {
  const { userId } = await auth()
  if (!userId) return { error: "Unauthorized" }

  if (data.weeklyDigestDay < 0 || data.weeklyDigestDay > 6) return { error: "Invalid day" }

  const invalidProviders = data.weeklyDigestProviders.filter((p) => !VALID_PROVIDERS.includes(p))
  if (invalidProviders.length > 0) return { error: "Invalid provider(s)" }

  await prisma.userSettings.upsert({
    where: { clerkUserId: userId },
    update: {
      weeklyDigest: data.weeklyDigest,
      weeklyDigestDay: data.weeklyDigestDay,
      weeklyDigestProviders: data.weeklyDigestProviders.join(","),
    },
    create: {
      clerkUserId: userId,
      weeklyDigest: data.weeklyDigest,
      weeklyDigestDay: data.weeklyDigestDay,
      weeklyDigestProviders: data.weeklyDigestProviders.join(","),
    },
  })

  revalidatePath("/notifications")
  return { error: null }
}
