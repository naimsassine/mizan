"use server"

import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"

export async function saveBackfillMonths(
  ownerType: "user" | "org",
  ownerId: string,
  months: number
) {
  const { userId, orgId } = await auth()
  if (!userId) return { error: "Unauthorized" }

  const authorizedId = orgId ?? userId
  if (authorizedId !== ownerId) return { error: "Unauthorized" }

  if (ownerType === "org" && orgId) {
    await prisma.orgSettings.upsert({
      where: { clerkOrgId: orgId },
      update: { backfillMonths: months },
      create: { clerkOrgId: orgId, backfillMonths: months },
    })
  } else {
    await prisma.userSettings.upsert({
      where: { clerkUserId: userId },
      update: { backfillMonths: months },
      create: { clerkUserId: userId, backfillMonths: months },
    })
  }

  return { error: null }
}
