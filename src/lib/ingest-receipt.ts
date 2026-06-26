import "server-only"
import { differenceInDays } from "date-fns"
import { prisma } from "@/lib/prisma"

// Single entry point for turning a parsed/entered receipt into a Receipt row. Centralizes the two
// things every ingestion path (email scan, file upload, manual entry) must do:
//   1. Cross-source dedup — never count the same payment twice when it arrives via more than one
//      channel (e.g. the email receipt AND a manual upload of the same invoice).
//   2. Subscription routing — a subscription-type receipt is evidence of a recurring plan, so we
//      link it to (or auto-create) a Subscription instead of letting it count as standalone spend.

export interface IncomingReceipt {
  ownerId: string
  ownerType: "user" | "org"
  provider: string | null
  amountUsd: number
  billingPeriodStart: Date | null
  billingPeriodEnd: Date | null
  invoiceId: string | null
  usageType: "api" | "subscription"
  source: string
  externalId?: string | null
  emailConnectionId?: string | null
  rawContent?: string | null
  parsedAt?: Date | null
}

export interface IngestResult {
  created: boolean
  duplicate: boolean
  subscriptionId: string | null
}

function inferPeriod(start: Date | null, end: Date | null): "monthly" | "yearly" {
  if (start && end && differenceInDays(end, start) > 300) return "yearly"
  return "monthly"
}

function subscriptionName(provider: string | null): string {
  if (!provider) return "Subscription"
  return provider.charAt(0).toUpperCase() + provider.slice(1)
}

// Find an existing active subscription this receipt confirms, or create one. Matches on owner +
// provider + (roughly) the same amount, so repeated monthly receipts all fold into one plan.
async function matchOrCreateSubscription(r: IncomingReceipt): Promise<string> {
  const candidates = await prisma.subscription.findMany({
    where: {
      ownerId: r.ownerId,
      status: "active",
      ...(r.provider ? { provider: r.provider } : {}),
    },
    select: { id: true, amountUsd: true },
  })
  const match = candidates.find((s) => Math.abs(Number(s.amountUsd) - r.amountUsd) < 0.01)
  if (match) return match.id

  const created = await prisma.subscription.create({
    data: {
      ownerId: r.ownerId,
      ownerType: r.ownerType,
      name: subscriptionName(r.provider),
      provider: r.provider,
      amountUsd: r.amountUsd,
      period: inferPeriod(r.billingPeriodStart, r.billingPeriodEnd),
      startDate: r.billingPeriodStart ?? r.parsedAt ?? new Date(),
      source: r.source,
      emailConnectionId: r.emailConnectionId ?? null,
    },
    select: { id: true },
  })
  return created.id
}

// Returns whether a receipt matching this one already exists for the owner. Uses invoiceId (most
// reliable) and, only when a billing period is known, the (provider, amount, periodStart) tuple —
// we deliberately don't dedup period-less receipts on amount alone, since two legitimate monthly
// charges of the same amount would collide.
async function isDuplicate(r: IncomingReceipt): Promise<boolean> {
  const or: Array<Record<string, unknown>> = []
  if (r.invoiceId) or.push({ invoiceId: r.invoiceId })
  if (r.billingPeriodStart) {
    or.push({
      provider: r.provider,
      amountUsd: r.amountUsd,
      billingPeriodStart: r.billingPeriodStart,
    })
  }
  if (or.length === 0) return false
  const existing = await prisma.receipt.findFirst({
    where: { ownerId: r.ownerId, OR: or },
    select: { id: true },
  })
  return existing !== null
}

// Ensure an existing subscription-type receipt is backed by a Subscription. Used when a receipt is
// reclassified api → subscription, so its cost still shows up as subscription spend (projected from
// the linked plan) instead of silently dropping to zero.
export async function linkReceiptToSubscription(receiptId: string): Promise<void> {
  const r = await prisma.receipt.findUnique({ where: { id: receiptId } })
  if (!r || r.usageType !== "subscription" || r.subscriptionId) return
  const subscriptionId = await matchOrCreateSubscription({
    ownerId: r.ownerId,
    ownerType: r.ownerType,
    provider: r.provider,
    amountUsd: Number(r.amountUsd),
    billingPeriodStart: r.billingPeriodStart,
    billingPeriodEnd: r.billingPeriodEnd,
    invoiceId: r.invoiceId,
    usageType: "subscription",
    source: r.source,
    emailConnectionId: r.emailConnectionId,
    parsedAt: r.parsedAt,
  })
  await prisma.receipt.update({ where: { id: receiptId }, data: { subscriptionId } })
}

export async function ingestReceipt(r: IncomingReceipt): Promise<IngestResult> {
  if (await isDuplicate(r)) return { created: false, duplicate: true, subscriptionId: null }

  const subscriptionId =
    r.usageType === "subscription" ? await matchOrCreateSubscription(r) : null

  await prisma.receipt.create({
    data: {
      ownerId: r.ownerId,
      ownerType: r.ownerType,
      emailConnectionId: r.emailConnectionId ?? null,
      subscriptionId,
      externalId: r.externalId ?? null,
      provider: r.provider,
      amountUsd: r.amountUsd,
      billingPeriodStart: r.billingPeriodStart,
      billingPeriodEnd: r.billingPeriodEnd,
      invoiceId: r.invoiceId,
      usageType: r.usageType,
      source: r.source,
      parsedAt: r.parsedAt ?? new Date(),
      rawContent: r.rawContent ?? null,
    },
  })
  return { created: true, duplicate: false, subscriptionId }
}
