import { auth, currentUser } from "@clerk/nextjs/server"
import {
  subDays,
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  getDaysInMonth,
  getDate,
} from "date-fns"
import { prisma } from "@/lib/prisma"
import { StatCard } from "@/components/dashboard/stat-card"
import { SpendChart } from "@/components/dashboard/spend-chart"
import { ModelBreakdown } from "@/components/dashboard/model-breakdown"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Plug } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

function receiptEffectiveDate(r: {
  billingPeriodStart: Date | null
  billingPeriodEnd: Date | null
  parsedAt: Date | null
  createdAt: Date
}): Date {
  return r.billingPeriodStart ?? r.billingPeriodEnd ?? r.parsedAt ?? r.createdAt
}

async function getDashboardData(ownerId: string) {
  const now = new Date()
  const thirtyDaysAgo = subDays(now, 30)
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)
  const lastMonthStart = startOfMonth(subMonths(now, 1))
  const lastMonthEnd = endOfMonth(subMonths(now, 1))

  const [monthlyRecords, last30Days, lastMonthRecords, connections, allReceipts] =
    await Promise.all([
      prisma.usageRecord.findMany({
        where: { ownerId, date: { gte: monthStart, lte: monthEnd } },
        select: { costUsd: true, inputTokens: true, outputTokens: true },
      }),
      prisma.usageRecord.findMany({
        where: { ownerId, date: { gte: thirtyDaysAgo } },
        select: { date: true, costUsd: true },
        orderBy: { date: "asc" },
      }),
      prisma.usageRecord.findMany({
        where: { ownerId, date: { gte: lastMonthStart, lte: lastMonthEnd } },
        select: { costUsd: true },
      }),
      prisma.providerConnection.count({ where: { ownerId } }),
      // Receipts for the last 30 days + current month — use effective date filtering in JS
      prisma.receipt.findMany({
        where: { ownerId },
        select: { amountUsd: true, billingPeriodStart: true, billingPeriodEnd: true, parsedAt: true, createdAt: true, usageType: true },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
    ])

  // Split receipts by time window
  const mtdReceipts = allReceipts.filter((r) => {
    const d = receiptEffectiveDate(r)
    return d >= monthStart && d <= monthEnd
  })
  const last30Receipts = allReceipts.filter((r) => receiptEffectiveDate(r) >= thirtyDaysAgo)
  const lastMonthReceipts = allReceipts.filter((r) => {
    const d = receiptEffectiveDate(r)
    return d >= lastMonthStart && d <= lastMonthEnd
  })

  const apiMtd = monthlyRecords.reduce((s: number, r) => s + Number(r.costUsd), 0)
  const apiReceiptMtd = mtdReceipts
    .filter((r) => r.usageType !== "subscription")
    .reduce((s: number, r) => s + Number(r.amountUsd), 0)
  const subscriptionMtd = mtdReceipts
    .filter((r) => r.usageType === "subscription")
    .reduce((s: number, r) => s + Number(r.amountUsd), 0)
  const mtdSpend = apiMtd + apiReceiptMtd + subscriptionMtd

  const lastMonthApiSpend = lastMonthRecords.reduce((s: number, r) => s + Number(r.costUsd), 0)
  const lastMonthReceiptSpend = lastMonthReceipts.reduce(
    (s: number, r) => s + Number(r.amountUsd),
    0,
  )
  const lastMonthSpend = lastMonthApiSpend + lastMonthReceiptSpend

  const spendDelta =
    lastMonthSpend > 0 ? ((mtdSpend - lastMonthSpend) / lastMonthSpend) * 100 : null

  const totalTokens = monthlyRecords.reduce(
    (s: number, r) => s + Number(r.inputTokens) + Number(r.outputTokens),
    0,
  )

  // Forecast
  const daysElapsed = getDate(now)
  const daysInMonth = getDaysInMonth(now)
  const dailyAvg = daysElapsed > 0 ? mtdSpend / daysElapsed : 0
  const forecastMonthEnd = dailyAvg * daysInMonth

  // Daily aggregation for chart — stacked API vs subscription
  const dailyMap = new Map<string, { api: number; subscription: number }>()
  const getDay = (key: string) => dailyMap.get(key) ?? { api: 0, subscription: 0 }

  for (const r of last30Days) {
    const key = format(r.date, "yyyy-MM-dd")
    const d = getDay(key)
    dailyMap.set(key, { ...d, api: d.api + Number(r.costUsd) })
  }
  for (const r of last30Receipts) {
    const key = format(receiptEffectiveDate(r), "yyyy-MM-dd")
    const d = getDay(key)
    if (r.usageType === "subscription") {
      dailyMap.set(key, { ...d, subscription: d.subscription + Number(r.amountUsd) })
    } else {
      dailyMap.set(key, { ...d, api: d.api + Number(r.amountUsd) })
    }
  }
  const chartData = Array.from(dailyMap.entries())
    .map(([date, { api, subscription }]) => ({ date, api, subscription }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // Per-model breakdown (API records only — receipts have no model granularity)
  const modelRecords = await prisma.usageRecord.groupBy({
    by: ["model", "provider"],
    where: { ownerId, date: { gte: monthStart, lte: monthEnd } },
    _sum: { costUsd: true, inputTokens: true, outputTokens: true },
    orderBy: { _sum: { costUsd: "desc" } },
  })

  const modelRows = modelRecords.map((r) => ({
    model: r.model,
    provider: r.provider as string,
    costUsd: Number(r._sum.costUsd ?? 0),
    totalTokens: Number(r._sum.inputTokens ?? 0) + Number(r._sum.outputTokens ?? 0),
    pct: apiMtd > 0 ? (Number(r._sum.costUsd ?? 0) / apiMtd) * 100 : 0,
  }))

  return {
    mtdSpend,
    apiSpend: apiMtd + apiReceiptMtd,
    subscriptionSpend: subscriptionMtd,
    lastMonthSpend,
    spendDelta,
    totalTokens,
    chartData,
    modelRows,
    connections,
    forecastMonthEnd,
    dailyAvg,
    daysInMonth,
    daysElapsed,
  }
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

export default async function OverviewPage() {
  const { userId, orgId } = await auth()
  const user = await currentUser()
  const ownerId = orgId ?? userId!

  const {
    mtdSpend,
    apiSpend,
    subscriptionSpend,
    spendDelta,
    totalTokens,
    chartData,
    modelRows,
    connections,
    forecastMonthEnd,
    dailyAvg,
    daysInMonth,
    daysElapsed,
  } = await getDashboardData(ownerId)

  const firstName = user?.firstName ?? "there"
  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[1.6rem] font-semibold tracking-tight text-zinc-900 leading-tight">
          {greeting},{" "}
          <span className="text-zinc-400">{firstName}</span>
        </h1>
        <p className="mt-1.5 text-sm text-zinc-500">here&apos;s your AI spend at a glance.</p>
      </div>

      {connections === 0 ? (
        /* Empty state */
        <Card className="rounded-xl border-zinc-100 bg-white shadow-none">
          <CardContent className="flex flex-col items-center gap-4 py-20">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
              <Plug className="h-5 w-5 text-zinc-400" strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-zinc-900">No connections yet</p>
              <p className="mt-1 text-xs text-zinc-500">
                Connect your first AI provider to start tracking spend.
              </p>
            </div>
            <Button
              size="sm"
              nativeButton={false}
              className="bg-zinc-900 text-white hover:bg-zinc-700"
              render={<Link href="/connections" />}
            >
              Connect a provider
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Spend this month"
              value={`$${mtdSpend.toFixed(2)}`}
              sub={
                spendDelta !== null
                  ? `${spendDelta >= 0 ? "+" : ""}${spendDelta.toFixed(1)}% vs last month`
                  : "First month of tracking"
              }
              subPositive={spendDelta !== null && spendDelta < 0}
            />
            <StatCard
              label="Tokens this month"
              value={formatTokens(totalTokens)}
              sub="input + output"
            />
            <StatCard
              label="Active connections"
              value={String(connections)}
              sub="providers connected"
            />
            <StatCard
              label="Forecast"
              value={`$${forecastMonthEnd.toFixed(2)}`}
              sub={`$${dailyAvg.toFixed(2)}/day · ${daysInMonth - daysElapsed}d left`}
            />
          </div>

          {(apiSpend > 0 || subscriptionSpend > 0) && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-zinc-900" />
                <span className="text-xs text-zinc-500">
                  API <span className="font-medium text-zinc-700">${apiSpend.toFixed(2)}</span>
                </span>
              </div>
              {subscriptionSpend > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-zinc-300" />
                  <span className="text-xs text-zinc-500">
                    Subscriptions{" "}
                    <span className="font-medium text-zinc-700">${subscriptionSpend.toFixed(2)}</span>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Spend chart */}
          <Card className="rounded-xl border-zinc-100 bg-white shadow-none">
            <CardHeader className="px-5 pb-2 pt-5">
              <p className="text-sm font-medium text-zinc-900">Spend — last 30 days</p>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <SpendChart data={chartData} />
            </CardContent>
          </Card>

          {/* Model breakdown */}
          <ModelBreakdown rows={modelRows} />
        </div>
      )}
    </div>
  )
}
