"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"

export async function createBudgetRule(formData: FormData) {
  const { userId, orgId } = await auth()
  if (!userId) return { error: "Unauthorized" }

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
      provider: provider && provider !== "all"
        ? (provider as "openai" | "anthropic" | "gemini" | "bedrock")
        : null,
    },
  })

  revalidatePath("/alerts")
  return { error: null }
}

export async function deleteBudgetRule(id: string) {
  const { userId, orgId } = await auth()
  if (!userId) return { error: "Unauthorized" }

  const ownerId = orgId ?? userId
  await prisma.budgetRule.deleteMany({ where: { id, ownerId } })
  revalidatePath("/alerts")
  return { error: null }
}

export async function acknowledgeAlert(id: string) {
  const { userId, orgId } = await auth()
  if (!userId) return { error: "Unauthorized" }

  const ownerId = orgId ?? userId

  // Verify the alert belongs to this owner via its budget rule
  const alert = await prisma.alert.findUnique({
    where: { id },
    include: { budgetRule: { select: { ownerId: true } } },
  })
  if (!alert || alert.budgetRule.ownerId !== ownerId) return { error: "Not found" }

  await prisma.alert.update({
    where: { id },
    data: { acknowledgedAt: new Date() },
  })

  revalidatePath("/alerts")
  return { error: null }
}
