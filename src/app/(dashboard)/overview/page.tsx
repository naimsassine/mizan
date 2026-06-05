import { auth, currentUser } from "@clerk/nextjs/server"
import { subDays, format, startOfMonth, endOfMonth } from "date-fns"
import { prisma } from "@/lib/prisma"
import { StatCard } from "@/components/dashboard/stat-card"
import { SpendChart } from "@/components/dashboard/spend-chart"
import { ModelBreakdown } from "@/components/dashboard/model-breakdown"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Plug } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Decimal } from "@/generated/prisma/runtime/library"

async function getDashboardData(ownerId: string) {
  const now = new Date()
  const thirtyDaysAgo = subDays(now, 30)
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)
  const lastMonthStart = startOfMonth(subDays(monthStart, 1))
  const lastMonthEnd = endOfMonth(subDays(monthStart, 1))

  const [monthlyRecords, last30Days, lastMonthRecords, connections] = await Promise.all([
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
  ])

  const mtdSpend = monthlyRecords.reduce((s, r) => s + Number(r.costUsd), 0)
  const lastMonthSpend = lastMonthRecords.reduce((s, r) => s + Number(r.costUsd), 0)
  const spendDelta =
    lastMonthSpend > 0 ? ((mtdSpend - lastMonthSpend) / lastMonthSpend) * 100 : null
  const totalTokens = monthlyRecords.reduce(
    (s, r) => s + Number(r.inputTokens) + Number(r.outputTokens),
    0
  )

  // Daily aggregation for the chart
  const dailyMap = new Map<string, number>()
  for (const r of last30Days) {
    const key = format(r.date, "yyyy-MM-dd")
    dailyMap.set(key, (dailyMap.get(key) ?? 0) + Number(r.costUsd))
  }
  const chartData = Array.from(dailyMap.entries()).map(([date, cost]) => ({ date, cost }))

  // Per-model breakdown
  const modelRecords = await prisma.usageRecord.groupBy({
    by: ["model", "provider"],
    where: { ownerId, date: { gte: monthStart, lte: monthEnd } },
    _sum: { costUsd: true, inputTokens: true, outputTokens: true },
    orderBy: { _sum: { costUsd: "desc" } },
  })

  const modelRows = modelRecords.map((r) => ({
    model: r.model,
    provider: r.provider,
    costUsd: Number(r._sum.costUsd ?? 0),
    totalTokens:
      Number(r._sum.inputTokens ?? 0) + Number(r._sum.outputTokens ?? 0),
    pct: mtdSpend > 0 ? (Number(r._sum.costUsd ?? 0) / mtdSpend) * 100 : 0,
  }))

  return { mtdSpend, lastMonthSpend, spendDelta, totalTokens, chartData, modelRows, connections }
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

  const { mtdSpend, spendDelta, totalTokens, chartData, modelRows, connections } =
    await getDashboardData(ownerId)

  const firstName = user?.firstName ?? "there"
  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          {greeting},{" "}
          <span className="text-zinc-400">{firstName}</span>
        </h1>
        <p className="mt-1 text-sm text-zinc-500">here&apos;s your AI spend at a glance.</p>
      </div>

      {connections === 0 ? (
        /* Empty state */
        <Card className="rounded-xl border-zinc-100 shadow-none">
          <CardContent className="flex flex-col items-center gap-4 py-16">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
              <Plug className="h-5 w-5 text-zinc-500" strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-zinc-900">No connections yet</p>
              <p className="mt-1 text-xs text-zinc-500">
                Connect your first AI provider to start tracking spend.
              </p>
            </div>
            <Button asChild size="sm" className="bg-zinc-900 text-white hover:bg-zinc-700">
              <Link href="/connections">Connect a provider</Link>
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
              label="Daily average"
              value={`$${(mtdSpend / new Date().getDate()).toFixed(2)}`}
              sub="this month"
            />
          </div>

          {/* Spend chart */}
          <Card className="rounded-xl border-zinc-100 shadow-none">
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
