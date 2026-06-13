import { auth } from "@clerk/nextjs/server"
import { Suspense } from "react"
import { unstable_cache } from "next/cache"
import { subDays, format, startOfDay, eachDayOfInterval } from "date-fns"
import { prisma } from "@/lib/prisma"
import { ownerUsageTag, ownerReceiptsTag } from "@/lib/cache"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { SpendChart } from "@/components/dashboard/spend-chart"
import { UsageTable } from "@/components/usage/usage-table"
import { TokenEfficiencyTable } from "@/components/usage/token-efficiency-table"
import { Download, ArrowRight } from "lucide-react"

const providerColors: Record<string, string> = {
  openai: "bg-emerald-50 text-emerald-700 border-emerald-100",
  anthropic: "bg-orange-50 text-orange-700 border-orange-100",
  gemini: "bg-blue-50 text-blue-700 border-blue-100",
  bedrock: "bg-yellow-50 text-yellow-700 border-yellow-100",
  groq: "bg-red-50 text-red-700 border-red-100",
  mistral: "bg-indigo-50 text-indigo-700 border-indigo-100",
  grok: "bg-zinc-50 text-zinc-700 border-zinc-200",
  openrouter: "bg-violet-50 text-violet-700 border-violet-100",
  litellm: "bg-teal-50 text-teal-700 border-teal-100",
}

const providerLabel: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
  bedrock: "Bedrock",
  groq: "Groq",
  mistral: "Mistral",
  grok: "Grok",
  openrouter: "OpenRouter",
  litellm: "LiteLLM",
}

const VALID_RANGES = [7, 30, 90] as const
type Range = (typeof VALID_RANGES)[number]

const VALID_PROVIDERS = ["openai", "anthropic", "gemini", "bedrock", "groq", "mistral", "grok", "openrouter", "litellm"] as const
type ProviderFilter = (typeof VALID_PROVIDERS)[number] | "all"

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

// Cached per (owner, range, provider). Tag-invalidated on any usage/receipt write.
function getUsageData(ownerId: string, days: Range, providerFilter: ProviderFilter) {
  return unstable_cache(
    () => loadUsageData(ownerId, days, providerFilter),
    ["usage-data", ownerId, String(days), providerFilter],
    { tags: [ownerUsageTag(ownerId), ownerReceiptsTag(ownerId)], revalidate: 300 },
  )()
}

async function loadUsageData(ownerId: string, days: Range, providerFilter: ProviderFilter) {
  const fromDate = subDays(new Date(), days)

  const [records, subscriptionReceipts] = await Promise.all([
    prisma.usageRecord.groupBy({
      by: ["date", "model", "provider"],
      where: {
        ownerId,
        date: { gte: fromDate },
        ...(providerFilter !== "all" ? { provider: providerFilter } : {}),
      },
      _sum: { costUsd: true, inputTokens: true, outputTokens: true },
      orderBy: [{ date: "desc" }],
    }),
    prisma.receipt.findMany({
      where: {
        ownerId,
        usageType: "subscription",
        ...(providerFilter !== "all" ? { provider: providerFilter } : {}),
      },
      select: {
        id: true,
        provider: true,
        amountUsd: true,
        billingPeriodStart: true,
        billingPeriodEnd: true,
        invoiceId: true,
        parsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ])

  // Filter subscriptions to the selected date window using effective date
  function effectiveDate(r: { billingPeriodStart: Date | null; billingPeriodEnd: Date | null; parsedAt: Date | null; createdAt: Date }) {
    return r.billingPeriodStart ?? r.billingPeriodEnd ?? r.parsedAt ?? r.createdAt
  }
  const filteredSubs = subscriptionReceipts.filter((r) => effectiveDate(r) >= fromDate)

  const apiCost = records.reduce((s, r) => s + Number(r._sum?.costUsd ?? 0), 0)
  const subCost = filteredSubs.reduce((s, r) => s + Number(r.amountUsd), 0)
  const totalCost = apiCost + subCost
  const totalInputTokens = records.reduce((s, r) => s + Number(r._sum?.inputTokens ?? 0), 0)
  const totalOutputTokens = records.reduce((s, r) => s + Number(r._sum?.outputTokens ?? 0), 0)
  const totalTokens = totalInputTokens + totalOutputTokens

  // Build stacked chart data
  const dailyMap = new Map<string, { api: number; subscription: number }>()
  const getDay = (key: string) => dailyMap.get(key) ?? { api: 0, subscription: 0 }
  for (const r of records) {
    const key = format(r.date, "yyyy-MM-dd")
    const d = getDay(key)
    dailyMap.set(key, { ...d, api: d.api + Number(r._sum?.costUsd ?? 0) })
  }
  const chartTo = new Date()
  for (const r of filteredSubs) {
    // Spread subscription cost evenly across its billing period rather than a one-day spike.
    if (r.billingPeriodStart && r.billingPeriodEnd) {
      const days = eachDayOfInterval({ start: r.billingPeriodStart, end: r.billingPeriodEnd })
      const perDayAmount = Number(r.amountUsd) / days.length
      for (const day of days) {
        if (day < fromDate || day > chartTo) continue
        const key = format(day, "yyyy-MM-dd")
        const d = getDay(key)
        dailyMap.set(key, { ...d, subscription: d.subscription + perDayAmount })
      }
      continue
    }
    const key = format(startOfDay(effectiveDate(r)), "yyyy-MM-dd")
    const d = getDay(key)
    dailyMap.set(key, { ...d, subscription: d.subscription + Number(r.amountUsd) })
  }
  const chartData = Array.from(dailyMap.entries())
    .map(([date, { api, subscription }]) => ({ date, api, subscription }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // Aggregate by model+provider for token efficiency view
  const efficiencyMap = new Map<string, { provider: string; inputTokens: number; outputTokens: number; costUsd: number }>()
  for (const r of records) {
    const key = `${r.provider}::${r.model}`
    const e = efficiencyMap.get(key) ?? { provider: r.provider, inputTokens: 0, outputTokens: 0, costUsd: 0 }
    e.inputTokens += Number(r._sum?.inputTokens ?? 0)
    e.outputTokens += Number(r._sum?.outputTokens ?? 0)
    e.costUsd += Number(r._sum?.costUsd ?? 0)
    efficiencyMap.set(key, e)
  }
  const efficiencyRows = Array.from(efficiencyMap.entries()).map(([key, e]) => ({
    model: key.split("::")[1],
    ...e,
  }))

  // Pre-flatten table rows to plain numbers so the result serializes into the data cache.
  const tableRows = records.map((r) => ({
    date: r.date,
    model: r.model,
    provider: r.provider,
    inputTokens: Number(r._sum.inputTokens ?? 0),
    outputTokens: Number(r._sum.outputTokens ?? 0),
    costUsd: Number(r._sum.costUsd ?? 0),
  }))

  const subs = filteredSubs.map((r) => ({
    id: r.id,
    provider: r.provider,
    amountUsd: Number(r.amountUsd),
    periodLabel:
      r.billingPeriodStart && r.billingPeriodEnd
        ? `${format(r.billingPeriodStart, "MMM d")} – ${format(r.billingPeriodEnd, "MMM d, yyyy")}`
        : format(effectiveDate(r), "MMM d, yyyy"),
    invoiceId: r.invoiceId,
  }))

  return {
    apiCost,
    subCost,
    totalCost,
    totalTokens,
    totalInputTokens,
    totalOutputTokens,
    recordCount: records.length,
    chartData,
    efficiencyRows,
    tableRows,
    subs,
  }
}

export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; provider?: string }>
}) {
  const { userId, orgId } = await auth()
  const ownerId = orgId ?? userId!

  const { range: rangeParam, provider: providerParam } = await searchParams
  const days: Range = (VALID_RANGES as readonly number[]).includes(Number(rangeParam))
    ? (Number(rangeParam) as Range)
    : 30
  const providerFilter: ProviderFilter =
    (VALID_PROVIDERS as readonly string[]).includes(providerParam ?? "")
      ? (providerParam as ProviderFilter)
      : "all"

  function rangeHref(d: number) {
    const params = new URLSearchParams()
    params.set("range", String(d))
    if (providerFilter !== "all") params.set("provider", providerFilter)
    return `/usage?${params}`
  }

  function providerHref(p: ProviderFilter) {
    const params = new URLSearchParams()
    params.set("range", String(days))
    if (p !== "all") params.set("provider", p)
    return `/usage?${params}`
  }

  // Header + filters depend only on the URL, so they render instantly. Only the data sections
  // (cards, chart, tables) stream in behind the skeleton.
  return (
    <div className="mx-auto max-w-5xl px-4 md:px-8 py-6 md:py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[1.6rem] font-semibold leading-tight tracking-tight text-zinc-900">
            Usage
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500">API token usage and subscription spend.</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/usage/export?range=${days}&provider=${providerFilter}`}
            download
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-500 transition-all duration-150 hover:border-zinc-300 hover:text-zinc-900"
          >
            <Download className="h-3 w-3" />
            <span className="hidden sm:inline">Export CSV</span>
          </a>
          {/* Range selector */}
          <div className="flex items-center gap-0.5 rounded-lg border border-zinc-200 bg-white p-1">
            {VALID_RANGES.map((d) => (
              <Link
                key={d}
                href={rangeHref(d)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150",
                  days === d ? "bg-zinc-900 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                )}
              >
                {d}d
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Provider filter */}
      <div className="mb-6 flex flex-wrap items-center gap-1.5">
        {(["all", ...VALID_PROVIDERS] as ProviderFilter[]).map((p) => (
          <Link
            key={p}
            href={providerHref(p)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-all duration-150",
              providerFilter === p
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-400 hover:text-zinc-900"
            )}
          >
            {p === "all" ? "All providers" : providerLabel[p]}
            {providerFilter === p && p !== "all" && (
              <span className="ml-1.5 opacity-70">×</span>
            )}
          </Link>
        ))}
        {(providerFilter !== "all" || days !== 30) && (
          <Link
            href="/usage"
            className="ml-1 text-xs text-zinc-400 hover:text-zinc-700 underline decoration-dotted transition-colors"
          >
            Clear filters
          </Link>
        )}
      </div>

      <Suspense
        key={`${days}:${providerFilter}`}
        fallback={<UsageDataSkeleton />}
      >
        <UsageData ownerId={ownerId} days={days} providerFilter={providerFilter} />
      </Suspense>
    </div>
  )
}

async function UsageData({
  ownerId,
  days,
  providerFilter,
}: {
  ownerId: string
  days: Range
  providerFilter: ProviderFilter
}) {
  const {
    apiCost,
    subCost,
    totalCost,
    totalTokens,
    totalInputTokens,
    totalOutputTokens,
    recordCount,
    chartData,
    efficiencyRows,
    tableRows,
    subs,
  } = await getUsageData(ownerId, days, providerFilter)

  return (
    <>
      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="rounded-xl border-zinc-100 bg-white shadow-none transition-shadow duration-200 hover:shadow-sm">
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Total spend</p>
            <p className="mt-2.5 font-mono text-2xl font-semibold tabular-nums tracking-tight text-zinc-900">
              ${totalCost.toFixed(2)}
            </p>
            {subCost > 0 ? (
              <div className="mt-1.5 flex items-center gap-2.5">
                <span className="text-xs text-zinc-400">API <span className="text-zinc-600">${apiCost.toFixed(2)}</span></span>
                <span className="text-xs text-zinc-400">·</span>
                <span className="text-xs text-zinc-400">Sub <span className="text-zinc-600">${subCost.toFixed(2)}</span></span>
              </div>
            ) : (
              <p className="mt-1.5 text-xs text-zinc-400">last {days} days</p>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-xl border-zinc-100 bg-white shadow-none transition-shadow duration-200 hover:shadow-sm">
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Total tokens</p>
            <p className="mt-2.5 font-mono text-2xl font-semibold tabular-nums tracking-tight text-zinc-900">
              {formatTokens(totalTokens)}
            </p>
            <p className="mt-1.5 text-xs text-zinc-400">input + output</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-zinc-100 bg-white shadow-none transition-shadow duration-200 hover:shadow-sm">
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Daily average</p>
            <p className="mt-2.5 font-mono text-2xl font-semibold tabular-nums tracking-tight text-zinc-900">
              ${(totalCost / days).toFixed(2)}
            </p>
            <p className="mt-1.5 text-xs text-zinc-400">per day</p>
          </CardContent>
        </Card>
      </div>

      {/* Spend chart */}
      {recordCount > 0 && (
        <Card className="mb-6 rounded-xl border-zinc-100 bg-white shadow-none">
          <CardHeader className="px-5 pb-2 pt-5">
            <p className="text-sm font-medium text-zinc-900">Spend — last {days} days</p>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <SpendChart data={chartData} />
          </CardContent>
        </Card>
      )}

      {/* API usage table */}
      {recordCount === 0 ? (
        <Card className="rounded-xl border-zinc-100 bg-white shadow-none">
          <CardContent className="py-16 text-center">
            <p className="text-sm text-zinc-500">No API usage data in the last {days} days.</p>
            <p className="mt-1 text-xs text-zinc-400">
              {providerFilter !== "all"
                ? "Try clearing the provider filter or a wider date range."
                : "Connect a provider to start tracking token usage."}
            </p>
            {providerFilter === "all" && (
              <Link
                href="/connections"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-zinc-700"
              >
                Add connection
                <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden rounded-xl border-zinc-100 bg-white shadow-none">
          <UsageTable
            // Rehydrate date in case the data cache serialized it to a string.
            rows={tableRows.map((r) => ({ ...r, date: new Date(r.date) }))}
            totalCost={apiCost}
            totalInputTokens={totalInputTokens}
            totalOutputTokens={totalOutputTokens}
            providerColors={providerColors}
          />
        </Card>
      )}

      {/* Token efficiency */}
      {efficiencyRows.length > 0 && (
        <Card className="mt-6 overflow-hidden rounded-xl border-zinc-100 bg-white shadow-none">
          <CardHeader className="px-5 pb-3 pt-5">
            <p className="text-sm font-medium text-zinc-900">Token efficiency</p>
            <p className="text-xs text-zinc-400 mt-0.5">
              Output/input token ratio per model — a low ratio may indicate overly verbose prompts.
            </p>
          </CardHeader>
          <TokenEfficiencyTable rows={efficiencyRows} />
        </Card>
      )}

      {/* Subscriptions section */}
      {subs.length > 0 && (
        <Card className="mt-6 overflow-hidden rounded-xl border-zinc-100 bg-white shadow-none">
          <CardHeader className="px-5 pb-3 pt-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-900">Subscriptions</p>
              <span className="font-mono text-xs text-zinc-400">${subCost.toFixed(2)}</span>
            </div>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-400">Period</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-400">Provider</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-400">Invoice</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-zinc-400">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {subs.map((r) => (
                  <tr key={r.id} className="transition-colors duration-100 hover:bg-zinc-50/70">
                    <td className="px-5 py-3 text-xs text-zinc-500">{r.periodLabel}</td>
                    <td className="px-5 py-3">
                      {r.provider ? (
                        <Badge variant="outline" className={`h-4 px-1.5 py-0 text-[10px] capitalize ${providerColors[r.provider] ?? "bg-zinc-50 text-zinc-600 border-zinc-200"}`}>
                          {r.provider}
                        </Badge>
                      ) : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs text-zinc-400">{r.invoiceId ?? "—"}</td>
                    <td className="px-5 py-3 text-right font-mono text-xs font-semibold tabular-nums text-zinc-900">
                      ${r.amountUsd.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  )
}

function UsageDataSkeleton() {
  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="rounded-xl border-zinc-100 shadow-none">
            <CardContent className="p-5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2.5 h-7 w-28" />
              <Skeleton className="mt-1.5 h-3 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="overflow-hidden rounded-xl border-zinc-100 shadow-none">
        <div className="border-b border-zinc-100 px-5 py-3">
          <div className="flex gap-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-16" />
            ))}
          </div>
        </div>
        <div className="divide-y divide-zinc-50">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-8 px-5 py-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-4 w-16 rounded-full" />
              <Skeleton className="ml-auto h-3 w-12" />
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}
