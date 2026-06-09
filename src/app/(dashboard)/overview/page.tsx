import { auth, currentUser } from "@clerk/nextjs/server"
import {
  subDays,
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  getDaysInMonth,
  getDate,
  formatDistanceToNow,
} from "date-fns"
import { prisma } from "@/lib/prisma"
import { StatCard } from "@/components/dashboard/stat-card"
import { SpendChart } from "@/components/dashboard/spend-chart"
import { ModelBreakdown } from "@/components/dashboard/model-breakdown"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Plug, ArrowRight, Key, BarChart2, Info } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const VALID_RANGES = [7, 30, 90] as const
type Range = (typeof VALID_RANGES)[number]

function receiptEffectiveDate(r: {
  billingPeriodStart: Date | null
  billingPeriodEnd: Date | null
  parsedAt: Date | null
  createdAt: Date
}): Date {
  return r.billingPeriodStart ?? r.billingPeriodEnd ?? r.parsedAt ?? r.createdAt
}

async function getDashboardData(ownerId: string, chartDays: Range) {
  const now = new Date()
  const chartFrom = subDays(now, chartDays)
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)
  const lastMonthStart = startOfMonth(subMonths(now, 1))
  const lastMonthEnd = endOfMonth(subMonths(now, 1))

  const [monthlyRecords, chartRecords, lastMonthRecords, connections, allReceipts, lastSyncedConn] =
    await Promise.all([
      prisma.usageRecord.findMany({
        where: { ownerId, date: { gte: monthStart, lte: monthEnd } },
        select: { costUsd: true, inputTokens: true, outputTokens: true },
      }),
      prisma.usageRecord.findMany({
        where: { ownerId, date: { gte: chartFrom } },
        select: { date: true, costUsd: true },
        orderBy: { date: "asc" },
      }),
      prisma.usageRecord.findMany({
        where: { ownerId, date: { gte: lastMonthStart, lte: lastMonthEnd } },
        select: { costUsd: true },
      }),
      prisma.providerConnection.count({ where: { ownerId } }),
      prisma.receipt.findMany({
        where: { ownerId },
        select: { amountUsd: true, billingPeriodStart: true, billingPeriodEnd: true, parsedAt: true, createdAt: true, usageType: true },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      prisma.providerConnection.findFirst({
        where: { ownerId, lastSyncedAt: { not: null } },
        orderBy: { lastSyncedAt: "desc" },
        select: { lastSyncedAt: true },
      }),
    ])

  const mtdReceipts = allReceipts.filter((r) => {
    const d = receiptEffectiveDate(r)
    return d >= monthStart && d <= monthEnd
  })
  const chartReceipts = allReceipts.filter((r) => receiptEffectiveDate(r) >= chartFrom)
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
  const lastMonthReceiptSpend = lastMonthReceipts.reduce((s: number, r) => s + Number(r.amountUsd), 0)
  const lastMonthSpend = lastMonthApiSpend + lastMonthReceiptSpend

  const spendDelta =
    lastMonthSpend > 0 ? ((mtdSpend - lastMonthSpend) / lastMonthSpend) * 100 : null

  const totalTokens = monthlyRecords.reduce(
    (s: number, r) => s + Number(r.inputTokens) + Number(r.outputTokens),
    0,
  )

  const daysElapsed = getDate(now)
  const daysInMonth = getDaysInMonth(now)
  const dailyAvg = daysElapsed > 0 ? mtdSpend / daysElapsed : 0
  const forecastMonthEnd = dailyAvg * daysInMonth

  const dailyMap = new Map<string, { api: number; subscription: number }>()
  const getDay = (key: string) => dailyMap.get(key) ?? { api: 0, subscription: 0 }

  for (const r of chartRecords) {
    const key = format(r.date, "yyyy-MM-dd")
    const d = getDay(key)
    dailyMap.set(key, { ...d, api: d.api + Number(r.costUsd) })
  }
  for (const r of chartReceipts) {
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
    lastSyncedAt: lastSyncedConn?.lastSyncedAt ?? null,
  }
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>
}) {
  const { userId, orgId } = await auth()
  const user = await currentUser()
  const ownerId = orgId ?? userId!

  const { range: rangeParam } = await searchParams
  const chartDays: Range = (VALID_RANGES as readonly number[]).includes(Number(rangeParam))
    ? (Number(rangeParam) as Range)
    : 30

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
    lastSyncedAt,
  } = await getDashboardData(ownerId, chartDays)

  const firstName = user?.firstName ?? "there"
  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"

  function rangeHref(d: number) {
    return `/overview?range=${d}`
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      {/* Header */}
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-[1.6rem] font-semibold tracking-tight text-zinc-900 leading-tight">
            {greeting},{" "}
            <span className="text-zinc-400">{firstName}</span>
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500">here&apos;s your AI spend at a glance.</p>
        </div>
        {lastSyncedAt && (
          <p className="text-xs text-zinc-400 pb-0.5">
            Updated {formatDistanceToNow(lastSyncedAt, { addSuffix: true })}
          </p>
        )}
      </div>

      {connections === 0 ? (
        /* Guided empty state */
        <div className="space-y-4">
          <p className="text-sm text-zinc-500">Get started in 3 steps:</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              {
                step: "1",
                icon: Key,
                title: "Connect a provider",
                desc: "Add your OpenAI, Anthropic, or other API key — read-only billing scope only.",
                href: "/connections",
                cta: "Add connection",
              },
              {
                step: "2",
                icon: BarChart2,
                title: "Backfill your history",
                desc: "Mizan automatically pulls the last 3 months of usage data when you connect.",
                href: null,
                cta: null,
              },
              {
                step: "3",
                icon: Plug,
                title: "Track & alert",
                desc: "Set budget rules and get email alerts before you overspend.",
                href: "/notifications",
                cta: "Set up alerts",
              },
            ].map(({ step, icon: Icon, title, desc, href, cta }) => (
              <Card
                key={step}
                className="rounded-xl border-zinc-100 bg-white shadow-none"
              >
                <CardContent className="p-5">
                  <div className="mb-3 flex items-center gap-2.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-semibold text-zinc-500">
                      {step}
                    </span>
                    <Icon className="h-4 w-4 text-zinc-400" strokeWidth={1.5} />
                  </div>
                  <p className="text-sm font-medium text-zinc-900">{title}</p>
                  <p className="mt-1 text-xs text-zinc-500 leading-relaxed">{desc}</p>
                  {href && cta && (
                    <Link
                      href={href}
                      className="mt-3 flex items-center gap-1 text-xs font-medium text-zinc-900 hover:text-zinc-600 transition-colors"
                    >
                      {cta}
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
          <Button
            size="sm"
            nativeButton={false}
            className="bg-zinc-900 text-white hover:bg-zinc-700"
            render={<Link href="/connections" />}
          >
            Connect your first provider
          </Button>
        </div>
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
              tooltip={`Based on your daily average of $${dailyAvg.toFixed(2)} over ${daysElapsed} day${daysElapsed !== 1 ? "s" : ""} this month, projected to ${daysInMonth} days.`}
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
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-zinc-900">Spend — last {chartDays} days</p>
                <div className="flex items-center gap-0.5 rounded-lg border border-zinc-100 bg-zinc-50 p-0.5">
                  {VALID_RANGES.map((d) => (
                    <Link
                      key={d}
                      href={rangeHref(d)}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-150",
                        chartDays === d
                          ? "bg-white text-zinc-900 shadow-sm"
                          : "text-zinc-400 hover:text-zinc-700"
                      )}
                    >
                      {d}d
                    </Link>
                  ))}
                </div>
              </div>
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
