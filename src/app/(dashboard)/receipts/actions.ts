"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"
import { after } from "next/server"
import { prisma } from "@/lib/prisma"
import { scanEmails } from "@/lib/scan-emails"
import { parseFileAsReceipt } from "@/lib/parse-file-receipt"

export async function disconnectEmailAccount(id: string) {
  const { userId, orgId } = await auth()
  if (!userId) return { error: "Unauthorized" }

  const ownerId = orgId ?? userId
  await prisma.emailConnection.deleteMany({ where: { id, ownerId } })

  revalidatePath("/receipts")
  return { error: null }
}

export async function triggerEmailScan(emailConnectionId: string) {
  const { userId, orgId } = await auth()
  if (!userId) return { error: "Unauthorized" }

  const ownerId = orgId ?? userId
  const conn = await prisma.emailConnection.findFirst({
    where: { id: emailConnectionId, ownerId },
  })
  if (!conn) return { error: "Not found" }

  after(async () => {
    await scanEmails(emailConnectionId)
  })

  revalidatePath("/receipts")
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
  const { userId, orgId } = await auth()
  if (!userId) return { error: "Unauthorized" }

  if (!data.amountUsd || data.amountUsd <= 0) return { error: "Amount must be greater than 0" }

  const ownerId = orgId ?? userId
  const ownerType: "user" | "org" = orgId ? "org" : "user"

  await prisma.receipt.create({
    data: {
      ownerId,
      ownerType,
      provider: data.provider || null,
      amountUsd: data.amountUsd,
      billingPeriodStart: data.billingPeriodStart ? new Date(data.billingPeriodStart) : null,
      billingPeriodEnd: data.billingPeriodEnd ? new Date(data.billingPeriodEnd) : null,
      invoiceId: data.invoiceId || null,
      usageType: data.usageType ?? "api",
      source: "receipt_upload",
      parsedAt: new Date(),
    },
  })

  revalidatePath("/receipts")
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
  const { userId, orgId } = await auth()
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

  revalidatePath("/receipts")
  revalidatePath("/overview")
  return { error: null }
}

export async function reclassifyReceipt(id: string, usageType: "api" | "subscription") {
  const { userId, orgId } = await auth()
  if (!userId) return { error: "Unauthorized" }

  const ownerId = orgId ?? userId
  await prisma.receipt.updateMany({
    where: { id, ownerId },
    data: { usageType },
  })

  revalidatePath("/receipts")
  revalidatePath("/overview")
  return { error: null }
}

export async function deleteReceipt(id: string) {
  const { userId, orgId } = await auth()
  if (!userId) return { error: "Unauthorized" }

  const ownerId = orgId ?? userId
  await prisma.receipt.deleteMany({ where: { id, ownerId } })

  revalidatePath("/receipts")
  revalidatePath("/overview")
  return { error: null }
}

export async function uploadReceipt(formData: FormData) {
  const { userId, orgId } = await auth()
  if (!userId) return { error: "Unauthorized" }

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

  const ownerId = orgId ?? userId
  const ownerType: "user" | "org" = orgId ? "org" : "user"

  await prisma.receipt.create({
    data: {
      ownerId,
      ownerType,
      provider: parsed.provider,
      amountUsd: parsed.amountUsd,
      billingPeriodStart: parsed.billingPeriodStart ? new Date(parsed.billingPeriodStart) : null,
      billingPeriodEnd: parsed.billingPeriodEnd ? new Date(parsed.billingPeriodEnd) : null,
      invoiceId: parsed.invoiceId,
      usageType: parsed.usageType ?? "api",
      source: "receipt_upload",
      parsedAt: new Date(),
      rawContent: `[file: ${file.name}]`,
    },
  })

  revalidatePath("/receipts")
  revalidatePath("/overview")
  return { error: null }
}
