import { format, subMonths } from "date-fns"
import { prisma } from "@/lib/prisma"
import { parseEmailAsReceipt } from "@/lib/parse-receipt"
import { ingestReceipt } from "@/lib/ingest-receipt"
import * as gmail from "@/lib/gmail"
import * as outlook from "@/lib/outlook"

// Emails from known billing domains — high precision
const FROM_DOMAINS = [
  "openai.com",
  "anthropic.com",
  "mail.anthropic.com",
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
  "amazon-web-services.com",
  "cloud.google.com",
  "x.ai",
  "moonshot.cn",
  "deepseek.com",
  "01.ai",
  "deepinfra.com",
]

// Provider name keywords — catches billing emails from transactional/marketing subdomains
const AI_KEYWORDS = [
  "openai", "anthropic", "claude", "chatgpt",
  "mistral", "cohere", "perplexity", "cursor",
  "groq", "gemini", "bedrock", "grok",
  "moonshot", "kimi", "deepseek", "together",
  "replicate", "huggingface", "fireworks", "anyscale",
]

const BILLING_KEYWORDS = ["invoice", "receipt", "billing", "payment", "statement"]

const GMAIL_FROM = FROM_DOMAINS.map((d) => `from:${d}`).join(" OR ")
const GMAIL_KEYWORDS = `subject:(${BILLING_KEYWORDS.join(" OR ")}) (${AI_KEYWORDS.join(" OR ")})`
const GMAIL_QUERY = `(${GMAIL_FROM}) OR (${GMAIL_KEYWORDS})`

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
    const query = `(${GMAIL_QUERY}) after:${since}`
    console.log("[scan-emails] Gmail query:", query)
    messageIds = await gmail.searchMessages(accessToken, query, 100)
  }
  console.log(`[scan-emails] Found ${messageIds.length} message IDs`)

  // Skip already-processed IDs — scope by ownerId so reconnects don't reimport
  const existing = await prisma.receipt.findMany({
    where: { ownerId: connection.ownerId, externalId: { not: null } },
    select: { externalId: true },
  })
  const seen = new Set(existing.map((r) => r.externalId!))
  const newIds = messageIds.filter((id) => !seen.has(id))
  console.log(`[scan-emails] ${newIds.length} new (${messageIds.length - newIds.length} already seen)`)

  let saved = 0
  for (const messageId of newIds) {
    try {
      const msg =
        connection.emailProvider === "outlook"
          ? await outlook.getMessage(accessToken, messageId)
          : await gmail.getMessage(accessToken, messageId)

      console.log(`[scan-emails] Processing: from="${msg.from}" subject="${msg.subject}"`)
      const parsed = await parseEmailAsReceipt(msg.subject, msg.from, msg.body)
      console.log(`[scan-emails] Parsed:`, JSON.stringify(parsed))
      if (!parsed.isAiBillingEmail || parsed.amountUsd === null) continue

      // Subscription-only mailboxes ignore pay-per-token (API) receipts.
      if (connection.scanScope === "subscription" && parsed.usageType !== "subscription") continue

      const { created } = await ingestReceipt({
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
        rawContent: `${msg.from}\n${msg.subject}\n\n${msg.body}`.slice(0, 10_000),
      })
      if (created) saved++
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
