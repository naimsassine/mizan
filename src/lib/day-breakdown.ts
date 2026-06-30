import { startOfDay, endOfDay, subDays, addDays, parseISO, format } from "date-fns"
import { prisma } from "@/lib/prisma"
import { dailyShareOn, type SubscriptionLike } from "@/lib/subscriptions"

// Decompose a single day's spend for one owner into the three sources the dashboard sums:
// API usage records (the main driver), api-type receipts, and projected subscriptions. Shared by
// the day-detail drill-down API route and the scripts/inspect-day.ts dev tool so the breakdown
// reconciles exactly with what the overview shows.

export interface DayApiRecord {
  provider: string
  model: string
  costUsd: number
  inputTokens: number
  outputTokens: number
  source: string
}

export interface DayReceipt {
  provider: string | null
  amountUsd: number
  usageType: string
  source: string
  invoiceId: string | null
  /** subscription-type receipts are evidence only — projected from the Subscription table instead */
  counted: boolean
}

export interface DaySubscription {
  provider: string | null
  amountUsd: number
  period: string
  status: string
  dailyShare: number
}

export interface DayBreakdown {
  date: string
  apiRecords: DayApiRecord[]
  apiTotal: number
  receipts: DayReceipt[]
  receiptTotal: number
  subscriptions: DaySubscription[]
  subscriptionTotal: number
  total: number
}

function receiptEffectiveDate(r: {
  billingPeriodStart: Date | null
  billingPeriodEnd: Date | null
  parsedAt: Date | null
  createdAt: Date
}): Date {
  return r.billingPeriodStart ?? r.billingPeriodEnd ?? r.parsedAt ?? r.createdAt
}

export async function getDayBreakdown(ownerId: string, dateStr: string): Promise<DayBreakdown> {
  const day = parseISO(dateStr) // yyyy-MM-dd, local midnight
  // Pull a ±1-day window then exact-match on the formatted date, so buckets align with how the
  // overview keys days (format(date, "yyyy-MM-dd")) regardless of how the DATE is stored.
  const from = startOfDay(subDays(day, 1))
  const to = endOfDay(addDays(day, 1))

  const [usage, allReceipts, subRows] = await Promise.all([
    prisma.usageRecord.findMany({
      where: { ownerId, date: { gte: from, lte: to } },
      select: {
        date: true, provider: true, model: true, costUsd: true,
        inputTokens: true, outputTokens: true, source: true,
      },
      orderBy: { costUsd: "desc" },
    }),
    prisma.receipt.findMany({
      where: { ownerId },
      select: {
        provider: true, amountUsd: true, usageType: true, source: true, invoiceId: true,
        billingPeriodStart: true, billingPeriodEnd: true, parsedAt: true, createdAt: true,
      },
    }),
    prisma.subscription.findMany({
      where: { ownerId, startDate: { lte: to }, OR: [{ endDate: null }, { endDate: { gte: from } }] },
      select: { provider: true, amountUsd: true, period: true, startDate: true, endDate: true, status: true },
    }),
  ])

  const apiRecords: DayApiRecord[] = usage
    .filter((u) => format(u.date, "yyyy-MM-dd") === dateStr)
    .map((u) => ({
      provider: u.provider,
      model: u.model,
      costUsd: Number(u.costUsd),
      inputTokens: Number(u.inputTokens),
      outputTokens: Number(u.outputTokens),
      source: u.source,
    }))
  const apiTotal = apiRecords.reduce((s, r) => s + r.costUsd, 0)

  const receipts: DayReceipt[] = allReceipts
    .filter((r) => format(receiptEffectiveDate(r), "yyyy-MM-dd") === dateStr)
    .map((r) => ({
      provider: r.provider,
      amountUsd: Number(r.amountUsd),
      usageType: r.usageType,
      source: r.source,
      invoiceId: r.invoiceId,
      counted: r.usageType !== "subscription",
    }))
  const receiptTotal = receipts.filter((r) => r.counted).reduce((s, r) => s + r.amountUsd, 0)

  const subscriptions: DaySubscription[] = subRows
    .map((s) => {
      const sub: SubscriptionLike = {
        amountUsd: Number(s.amountUsd),
        period: s.period,
        startDate: s.startDate,
        endDate: s.endDate,
        status: s.status,
      }
      return {
        provider: s.provider,
        amountUsd: Number(s.amountUsd),
        period: s.period,
        status: s.status,
        dailyShare: dailyShareOn(sub, day),
      }
    })
    .filter((s) => s.dailyShare > 0)
  const subscriptionTotal = subscriptions.reduce((s, r) => s + r.dailyShare, 0)

  return {
    date: dateStr,
    apiRecords,
    apiTotal,
    receipts,
    receiptTotal,
    subscriptions,
    subscriptionTotal,
    total: apiTotal + receiptTotal + subscriptionTotal,
  }
}
