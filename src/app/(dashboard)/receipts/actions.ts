"use server"

import { revalidatePath } from "next/cache"
import { after } from "next/server"
import { prisma } from "@/lib/prisma"
import { getOwner } from "@/lib/owner"
import { DEMO_DISABLED } from "@/lib/demo"
import { scanEmails } from "@/lib/scan-emails"
import { parseFileAsReceipt } from "@/lib/parse-file-receipt"
import { ingestReceipt, linkReceiptToSubscription } from "@/lib/ingest-receipt"
import { revalidateOwnerSpend } from "@/lib/cache"

export async function disconnectEmailAccount(id: string) {
  const { userId, orgId, isDemo } = await getOwner()
  if (isDemo) return DEMO_DISABLED
  if (!userId) return { error: "Unauthorized" }

  const ownerId = orgId ?? userId
  await prisma.emailConnection.deleteMany({ where: { id, ownerId } })

  revalidatePath("/connections")
  return { error: null }
}

export async function triggerEmailScan(emailConnectionId: string) {
  const { userId, orgId, isDemo } = await getOwner()
  if (isDemo) return DEMO_DISABLED
  if (!userId) return { error: "Unauthorized" }

  const ownerId = orgId ?? userId
  const conn = await prisma.emailConnection.findFirst({
    where: { id: emailConnectionId, ownerId },
  })
  if (!conn) return { error: "Not found" }

  after(async () => {
    await scanEmails(emailConnectionId)
    // Scan may have imported new receipts — refresh cached spend aggregates.
    revalidateOwnerSpend(ownerId)
  })

  revalidatePath("/connections")
  return { error: null }
}

export async function createReceipt(data: {
  provider: string | null
  amountUsd: number
  billingPeriodStart: string | null
  billingPeriodEnd: string | null
  invoiceId: string | null
  usageType?: "api" | "subscription"
}) {
  const { userId, orgId, orgRole, isDemo } = await getOwner()
  if (isDemo) return DEMO_DISABLED
  if (!userId) return { error: "Unauthorized" }
  if (orgId && orgRole === "org:viewer") return { error: "Viewers cannot add receipts" }

  if (!data.amountUsd || data.amountUsd <= 0) return { error: "Amount must be greater than 0" }

  const ownerId = orgId ?? userId
  const ownerType: "user" | "org" = orgId ? "org" : "user"

  const { duplicate } = await ingestReceipt({
    ownerId,
    ownerType,
    provider: data.provider || null,
    amountUsd: data.amountUsd,
    billingPeriodStart: data.billingPeriodStart ? new Date(data.billingPeriodStart) : null,
    billingPeriodEnd: data.billingPeriodEnd ? new Date(data.billingPeriodEnd) : null,
    invoiceId: data.invoiceId || null,
    usageType: data.usageType ?? "api",
    source: "receipt_upload",
  })
  if (duplicate) return { error: "A matching receipt already exists." }

  revalidateOwnerSpend(ownerId)
  revalidatePath("/connections")
  revalidatePath("/overview")
  return { error: null }
}

export async function updateReceipt(
  id: string,
  data: {
    provider: string | null
    amountUsd: number
    billingPeriodStart: string | null
    billingPeriodEnd: string | null
    invoiceId: string | null
    usageType?: "api" | "subscription"
  },
) {
  const { userId, orgId, isDemo } = await getOwner()
  if (isDemo) return DEMO_DISABLED
  if (!userId) return { error: "Unauthorized" }

  if (!data.amountUsd || data.amountUsd <= 0) return { error: "Amount must be greater than 0" }

  const ownerId = orgId ?? userId
  await prisma.receipt.updateMany({
    where: { id, ownerId },
    data: {
      provider: data.provider || null,
      amountUsd: data.amountUsd,
      billingPeriodStart: data.billingPeriodStart ? new Date(data.billingPeriodStart) : null,
      billingPeriodEnd: data.billingPeriodEnd ? new Date(data.billingPeriodEnd) : null,
      invoiceId: data.invoiceId || null,
      ...(data.usageType ? { usageType: data.usageType } : {}),
    },
  })

  revalidateOwnerSpend(ownerId)
  revalidatePath("/connections")
  revalidatePath("/overview")
  return { error: null }
}

export async function reclassifyReceipt(id: string, usageType: "api" | "subscription") {
  const { userId, orgId, isDemo } = await getOwner()
  if (isDemo) return DEMO_DISABLED
  if (!userId) return { error: "Unauthorized" }

  const ownerId = orgId ?? userId
  await prisma.receipt.updateMany({
    where: { id, ownerId },
    data: { usageType },
  })
  // Reclassifying to subscription must back the receipt with a Subscription so its cost still
  // counts (projected), rather than dropping to zero.
  if (usageType === "subscription") await linkReceiptToSubscription(id)

  revalidateOwnerSpend(ownerId)
  revalidatePath("/connections")
  revalidatePath("/overview")
  return { error: null }
}

export async function deleteReceipt(id: string) {
  const { userId, orgId, orgRole, isDemo } = await getOwner()
  if (isDemo) return DEMO_DISABLED
  if (!userId) return { error: "Unauthorized" }
  if (orgId && orgRole === "org:viewer") return { error: "Viewers cannot delete receipts" }

  const ownerId = orgId ?? userId
  await prisma.receipt.deleteMany({ where: { id, ownerId } })

  revalidateOwnerSpend(ownerId)
  revalidatePath("/connections")
  revalidatePath("/overview")
  return { error: null }
}

export async function uploadReceipt(formData: FormData) {
  const { userId, orgId, orgRole, isDemo } = await getOwner()
  if (isDemo) return DEMO_DISABLED
  if (!userId) return { error: "Unauthorized" }
  if (orgId && orgRole === "org:viewer") return { error: "Viewers cannot upload receipts" }

  const ownerId = orgId ?? userId
  const recentUploads = await prisma.receipt.count({
    where: {
      ownerId,
      source: "receipt_upload",
      parsedAt: { gte: new Date(Date.now() - 3_600_000) },
    },
  })
  if (recentUploads >= 10) return { error: "Upload limit reached. Try again in an hour." }

  const file = formData.get("file") as File | null
  if (!file || file.size === 0) return { error: "No file provided" }
  if (file.size > 9 * 1024 * 1024) return { error: "File must be under 9 MB" }

  const supported = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"]
  if (!supported.includes(file.type)) return { error: "Unsupported file type" }

  const buffer = Buffer.from(await file.arrayBuffer())
  const parsed = await parseFileAsReceipt(buffer, file.type)

  if (!parsed.isAiBillingEmail) {
    return { error: "No AI billing information found in this file" }
  }
  if (parsed.amountUsd === null) {
    return { error: "Could not extract an amount from this file. Add it manually." }
  }

  const ownerType: "user" | "org" = orgId ? "org" : "user"

  const { duplicate } = await ingestReceipt({
    ownerId,
    ownerType,
    provider: parsed.provider,
    amountUsd: parsed.amountUsd,
    billingPeriodStart: parsed.billingPeriodStart ? new Date(parsed.billingPeriodStart) : null,
    billingPeriodEnd: parsed.billingPeriodEnd ? new Date(parsed.billingPeriodEnd) : null,
    invoiceId: parsed.invoiceId,
    usageType: parsed.usageType ?? "api",
    source: "receipt_upload",
    rawContent: `[file: ${file.name}]`,
  })
  if (duplicate) return { error: "This receipt looks like one you already have." }

  revalidateOwnerSpend(ownerId)
  revalidatePath("/connections")
  revalidatePath("/overview")
  return { error: null }
}
