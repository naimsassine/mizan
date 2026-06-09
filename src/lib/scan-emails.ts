import { format, subMonths } from "date-fns"
import { prisma } from "@/lib/prisma"
import { getValidAccessToken, searchMessages, getMessage } from "@/lib/gmail"
import { parseEmailAsReceipt } from "@/lib/parse-receipt"

// Emails from these domains that look like receipts/invoices
const PROVIDER_DOMAINS = [
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

// AWS and Google need extra subject filtering to avoid noise
const BROAD_DOMAINS_QUERY =
  "(from:amazon-web-services.com OR from:cloud.google.com) (invoice OR receipt OR billing)"

const QUERY = `(${PROVIDER_DOMAINS.join(" OR ")}) OR ${BROAD_DOMAINS_QUERY}`

export async function scanEmails(
  emailConnectionId: string,
): Promise<{ scanned: number; saved: number }> {
  const connection = await prisma.emailConnection.findUnique({
    where: { id: emailConnectionId },
  })
  if (!connection) throw new Error("Email connection not found")

  let accessToken: string
  try {
    accessToken = await getValidAccessToken(emailConnectionId)
  } catch {
    await prisma.emailConnection.update({
      where: { id: emailConnectionId },
      data: { status: "error" },
    })
    throw new Error("Failed to refresh Gmail token")
  }

  const since = format(subMonths(new Date(), 6), "yyyy/MM/dd")
  const query = `(${QUERY}) after:${since}`

  const messageIds = await searchMessages(accessToken, query, 100)

  // Filter out already-processed IDs
  const existing = await prisma.receipt.findMany({
    where: { emailConnectionId, externalId: { not: null } },
    select: { externalId: true },
  })
  const seen = new Set(existing.map((r) => r.externalId!))
  const newIds = messageIds.filter((id) => !seen.has(id))

  let saved = 0
  for (const messageId of newIds) {
    try {
      const msg = await getMessage(accessToken, messageId)
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
    data: { lastScannedAt: new Date(), status: "active" },
  })

  return { scanned: newIds.length, saved }
}
