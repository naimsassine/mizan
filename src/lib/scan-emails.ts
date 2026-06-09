import { format, subMonths } from "date-fns"
import { prisma } from "@/lib/prisma"
import { parseEmailAsReceipt } from "@/lib/parse-receipt"
import * as gmail from "@/lib/gmail"
import * as outlook from "@/lib/outlook"

const GMAIL_DOMAINS = [
  "openai.com",
  "anthropic.com",
  "mistral.ai",
  "cohere.com",
  "perplexity.ai",
  "cursor.sh",
  "together.ai",
  "replicate.com",
  "huggingface.co",
  "ai21.com",
  "groq.com",
  "anyscale.com",
  "fireworks.ai",
].map((d) => `from:${d}`)

const GMAIL_BROAD = "(from:amazon-web-services.com OR from:cloud.google.com) (invoice OR receipt OR billing)"
const GMAIL_QUERY = `(${GMAIL_DOMAINS.join(" OR ")}) OR ${GMAIL_BROAD}`

export async function scanEmails(
  emailConnectionId: string,
): Promise<{ scanned: number; saved: number }> {
  const connection = await prisma.emailConnection.findUnique({
    where: { id: emailConnectionId },
  })
  if (!connection) throw new Error("Email connection not found")

  let accessToken: string
  try {
    accessToken =
      connection.emailProvider === "outlook"
        ? await outlook.getValidAccessToken(emailConnectionId)
        : await gmail.getValidAccessToken(emailConnectionId)
  } catch {
    await prisma.emailConnection.update({
      where: { id: emailConnectionId },
      data: { status: "error" },
    })
    throw new Error("Failed to refresh token")
  }

  // Fetch message IDs from the appropriate provider
  let messageIds: string[]
  if (connection.emailProvider === "outlook") {
    messageIds = await outlook.searchMessages(accessToken, 100)
  } else {
    const since = format(subMonths(new Date(), 6), "yyyy/MM/dd")
    messageIds = await gmail.searchMessages(accessToken, `(${GMAIL_QUERY}) after:${since}`, 100)
  }

  // Skip already-processed IDs
  const existing = await prisma.receipt.findMany({
    where: { emailConnectionId, externalId: { not: null } },
    select: { externalId: true },
  })
  const seen = new Set(existing.map((r) => r.externalId!))
  const newIds = messageIds.filter((id) => !seen.has(id))

  let saved = 0
  for (const messageId of newIds) {
    try {
      const msg =
        connection.emailProvider === "outlook"
          ? await outlook.getMessage(accessToken, messageId)
          : await gmail.getMessage(accessToken, messageId)

      const parsed = await parseEmailAsReceipt(msg.subject, msg.from, msg.body)
      if (!parsed.isAiBillingEmail || parsed.amountUsd === null) continue

      await prisma.receipt.create({
        data: {
          ownerId: connection.ownerId,
          ownerType: connection.ownerType,
          emailConnectionId,
          externalId: messageId,
          provider: parsed.provider,
          amountUsd: parsed.amountUsd,
          billingPeriodStart: parsed.billingPeriodStart
            ? new Date(parsed.billingPeriodStart)
            : null,
          billingPeriodEnd: parsed.billingPeriodEnd ? new Date(parsed.billingPeriodEnd) : null,
          invoiceId: parsed.invoiceId,
          usageType: parsed.usageType ?? "api",
          source: "email_forward",
          parsedAt: new Date(),
          rawContent: `${msg.from}\n${msg.subject}\n\n${msg.body}`.slice(0, 10_000),
        },
      })
      saved++
    } catch (err) {
      console.error(`[scan-emails] Failed to process message ${messageId}:`, err)
    }
  }

  await prisma.emailConnection.update({
    where: { id: emailConnectionId },
    data: { lastScannedAt: new Date(), status: "active", lastScanFound: saved },
  })

  return { scanned: newIds.length, saved }
}
