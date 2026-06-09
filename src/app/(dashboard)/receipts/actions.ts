"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"
import { after } from "next/server"
import { prisma } from "@/lib/prisma"
import { scanEmails } from "@/lib/scan-emails"

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
