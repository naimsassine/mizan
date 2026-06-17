import { getOwner } from "@/lib/owner"
import { Suspense } from "react"
import { unstable_cache } from "next/cache"
import { subDays } from "date-fns"
import { prisma } from "@/lib/prisma"
import { ownerUsageTag } from "@/lib/cache"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { CostPerMillionChart } from "@/components/compare/cost-per-million-chart"
import { Info, ArrowRight } from "lucide-react"

const PROVIDER_LABEL: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
  bedrock: "Bedrock",
  groq: "Groq",
  mistral: "Mistral",
  grok: "xAI",
  openrouter: "OpenRouter",
  litellm: "LiteLLM",
}

const PROVIDER_COLORS: Record<string, string> = {
  openai: "bg-emerald-50 text-emerald-700 border-emerald-100",
  anthropic: "bg-orange-50 text-orange-700 border-orange-100",
  gemini: "bg-blue-50 text-blue-700 border-blue-100",
  bedrock: "bg-yellow-50 text-yellow-700 border-yellow-100",
  groq: "bg-red-50 text-red-700 border-red-100",
  mistral: "bg-purple-50 text-purple-700 border-purple-100",
  grok: "bg-slate-50 text-slate-700 border-slate-200",
  openrouter: "bg-rose-50 text-rose-700 border-rose-100",
  litellm: "bg-lime-50 text-lime-700 border-lime-100",
}

const VALID_RANGES = [30, 90, 365, 0] as const
type Range = (typeof VALID_RANGES)[number]

type Row = {
  provider: string
  model: string
  totalCost: number
  totalTokens: number
  inputTokens: number
  outputTokens: number
  costPer1M: number
}

function rangeLabel(d: number) {
  if (d === 0) return "All time"
  if (d === 365) return "1y"
  return `${d}d`
}

function rangeShort(d: number) {
  if (d === 0) return "All"
  if (d === 365) return "1y"
  return `${d}d`
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

// Cached per (owner, range). Tag-invalidated on any usage write. Provider filtering is applied
// after the cache read since it only narrows an already-fetched, cheap row set.
function getCompareRows(ownerId: string, days: Range) {
  return unstable_cache(
    () => loadCompareRows(ownerId, days),
    ["compare-rows", ownerId, String(days)],
    { tags: [ownerUsageTag(ownerId)], revalidate: 300 },
  )()
}

async function loadCompareRows(ownerId: string, days: Range): Promise<Row[]> {
  const fromDate = days === 0 ? undefined : subDays(new Date(), days)

  const records = await prisma.usageRecord.groupBy({
    by: ["provider", "model"],
    where: {
      ownerId,
      ...(fromDate ? { date: { gte: fromDate } } : {}),
    },
    _sum: { costUsd: true, inputTokens: true, outputTokens: true },
  })

  return records
    .map((r) => {
      const totalCost = Number(r._sum.costUsd ?? 0)
      const inputTokens = Number(r._sum.inputTokens ?? 0)
      const outputTokens = Number(r._sum.outputTokens ?? 0)
      const totalTokens = inputTokens + outputTokens
      const costPer1M = totalTokens > 0 ? (totalCost / totalTokens) * 1_000_000 : 0
      return { provider: r.provider, model: r.model, totalCost, totalTokens, inputTokens, outputTokens, costPer1M }
    })
    .filter((r) => r.totalCost > 0)
    .sort((a, b) => {
      // cost-only rows (e.g. Bedrock with no token counts) sort last
      if (a.totalTokens === 0 && b.totalTokens > 0) return 1
      if (a.totalTokens > 0 && b.totalTokens === 0) return -1
      return a.costPer1M - b.costPer1M
    })
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; provider?: string }>
}) {
  const { userId, orgId } = await getOwner()
  const ownerId = orgId ?? userId!

  const { range: rangeParam, provider: providerParam } = await searchParams
  const days: Range = (VALID_RANGES as readonly number[]).includes(Number(rangeParam))
    ? (Number(rangeParam) as Range)
    : 30

  // filteredProvider only depends on the URL + the static label map, so it's known up front.
  const filteredProvider =
    providerParam && Object.keys(PROVIDER_LABEL).includes(providerParam) ? providerParam : null

  function rangeHref(d: number) {
    const p = new URLSearchParams()
    p.set("range", String(d))
    if (filteredProvider) p.set("provider", filteredProvider)
    return `/compare?${p}`
  }

  // Header + range selector render instantly; the rest streams once the aggregate resolves.
  return (
    <div className="mx-auto max-w-5xl px-4 md:px-8 py-6 md:py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[1.6rem] font-semibold leading-tight tracking-tight text-zinc-900">
            Compare
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500">
            Side-by-side cost per 1M tokens across your connected models.
          </p>
        </div>
        <div className="flex items-center gap-0.5 rounded-lg border border-zinc-200 bg-white p-1 self-start shrink-0">
          {VALID_RANGES.map((d) => (
            <Link
              key={d}
              href={rangeHref(d)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150",
                days === d
                  ? "bg-zinc-900 text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-900"
              )}
            >
              {rangeShort(d)}
            </Link>
          ))}
        </div>
      </div>

      <Suspense key={`${days}:${filteredProvider}`} fallback={<CompareDataSkeleton />}>
        <CompareData ownerId={ownerId} days={days} filteredProvider={filteredProvider} />
      </Suspense>
    </div>
  )
}

async function CompareData({
  ownerId,
  days,
  filteredProvider,
}: {
  ownerId: string
  days: Range
  filteredProvider: string | null
}) {
  const rows = await getCompareRows(ownerId, days)

  const displayRows = filteredProvider ? rows.filter((r) => r.provider === filteredProvider) : rows
  const activeProviders = Array.from(new Set(rows.map((r) => r.provider)))

  const chartData = displayRows
    .filter((r) => r.totalTokens > 0)
    .slice(0, 20)
    .map((r) => ({
      label: r.model.length > 26 ? r.model.slice(0, 26) + "…" : r.model,
      costPer1M: parseFloat(r.costPer1M.toFixed(4)),
      provider: r.provider,
    }))

  function providerHref(p: string | null) {
    const params = new URLSearchParams()
    params.set("range", String(days))
    if (p) params.set("provider", p)
    return `/compare?${params}`
  }

  return (
    <>
      {/* Provider filter */}
      {activeProviders.length > 1 && (
        <div className="mb-6 flex flex-wrap items-center gap-1.5">
          <Link
            href={providerHref(null)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-all duration-150",
              !filteredProvider
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-400 hover:text-zinc-900"
            )}
          >
            All providers
          </Link>
          {activeProviders.map((p) => (
            <Link
              key={p}
              href={providerHref(p)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-all duration-150",
                filteredProvider === p
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-400 hover:text-zinc-900"
              )}
            >
              {PROVIDER_LABEL[p] ?? p}
              {filteredProvider === p && <span className="ml-1.5 opacity-70">×</span>}
            </Link>
          ))}
        </div>
      )}

      {displayRows.length === 0 ? (
        <Card className="rounded-xl border-zinc-100 bg-white shadow-none">
          <CardContent className="py-16 text-center">
            <p className="text-sm text-zinc-500">No usage data for this period.</p>
            <p className="mt-1 text-xs text-zinc-400">
              Connect a provider to start seeing cost comparisons.
            </p>
            <Link
              href="/connections"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-zinc-700"
            >
              Add connection
              <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Chart */}
          <Card className="mb-6 rounded-xl border-zinc-100 bg-white shadow-none">
            <CardHeader className="px-5 pb-2 pt-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-zinc-900">Cost / 1M tokens — cheapest first</p>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    Based on your actual token mix for {rangeLabel(days).toLowerCase()}
                  </p>
                </div>
                <div className="flex items-start gap-1 text-xs text-zinc-400 shrink-0">
                  <Info className="h-3 w-3 mt-0.5 shrink-0" strokeWidth={1.5} />
                  <span className="hidden sm:inline">Effective rate from real usage</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <CostPerMillionChart data={chartData} />
            </CardContent>
          </Card>

          {displayRows.some((r) => r.totalTokens === 0) && (
            <div className="mb-6 flex items-start gap-2 rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3 text-xs text-zinc-500">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
              <span>
                Cost-only sources (e.g. AWS Bedrock via Cost Explorer) report spend without token
                counts, so they can&apos;t be ranked by $/1M tokens and are excluded from the chart
                above. They&apos;re listed at the bottom of the table.
              </span>
            </div>
          )}

          {/* Summary stats — only for rows with token data */}
          {(() => {
            const tokenRows = displayRows.filter((r) => r.totalTokens > 0)
            return tokenRows.length >= 2 ? (
              <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="rounded-xl border-zinc-100 bg-white shadow-none">
                  <CardContent className="p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Cheapest model</p>
                    <p className="mt-2 font-mono text-sm font-semibold text-zinc-900 truncate">
                      {tokenRows[0].model}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-zinc-400">
                      ${tokenRows[0].costPer1M.toFixed(4)}/1M tokens
                    </p>
                  </CardContent>
                </Card>
                <Card className="rounded-xl border-zinc-100 bg-white shadow-none">
                  <CardContent className="p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Most expensive</p>
                    <p className="mt-2 font-mono text-sm font-semibold text-zinc-900 truncate">
                      {tokenRows[tokenRows.length - 1].model}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-zinc-400">
                      ${tokenRows[tokenRows.length - 1].costPer1M.toFixed(4)}/1M tokens
                    </p>
                  </CardContent>
                </Card>
                <Card className="rounded-xl border-zinc-100 bg-white shadow-none">
                  <CardContent className="p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Price spread</p>
                    <p className="mt-2 font-mono text-2xl font-semibold tabular-nums tracking-tight text-zinc-900">
                      {(tokenRows[tokenRows.length - 1].costPer1M / tokenRows[0].costPer1M).toFixed(1)}×
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-400">most vs least expensive</p>
                  </CardContent>
                </Card>
              </div>
            ) : null
          })()}

          {/* Table */}
          <Card className="overflow-hidden rounded-xl border-zinc-100 bg-white shadow-none">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100">
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-400">Model</th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-400">Provider</th>
                    <th className="hidden md:table-cell px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-zinc-400">Input</th>
                    <th className="hidden md:table-cell px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-zinc-400">Output</th>
                    <th className="hidden sm:table-cell px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-zinc-400">Total cost</th>
                    <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-zinc-400">$/1M tokens</th>
                    <th className="sr-only">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {displayRows.map((row, i) => (
                    <tr key={i} className="transition-colors duration-100 hover:bg-zinc-50/70">
                      <td className="px-5 py-3 font-mono text-xs text-zinc-700 max-w-[200px] truncate">
                        {row.model}
                      </td>
                      <td className="px-5 py-3">
                        <Badge
                          variant="outline"
                          className={`h-4 px-1.5 py-0 text-[10px] ${PROVIDER_COLORS[row.provider] ?? "bg-zinc-50 text-zinc-600 border-zinc-200"}`}
                        >
                          {PROVIDER_LABEL[row.provider] ?? row.provider}
                        </Badge>
                      </td>
                      <td className="hidden md:table-cell px-5 py-3 text-right font-mono text-xs tabular-nums text-zinc-500">
                        {row.inputTokens > 0 ? formatTokens(row.inputTokens) : "—"}
                      </td>
                      <td className="hidden md:table-cell px-5 py-3 text-right font-mono text-xs tabular-nums text-zinc-500">
                        {row.outputTokens > 0 ? formatTokens(row.outputTokens) : "—"}
                      </td>
                      <td className="hidden sm:table-cell px-5 py-3 text-right font-mono text-xs font-semibold tabular-nums text-zinc-900">
                        ${row.totalCost.toFixed(2)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-xs font-semibold tabular-nums text-zinc-900">
                        {row.totalTokens > 0 ? `$${row.costPer1M.toFixed(4)}` : "—"}
                      </td>
                      <td className="px-5 py-3 text-right text-[10px] text-zinc-400">
                        {row.totalTokens === 0 ? "cost only" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  )
}

function CompareDataSkeleton() {
  return (
    <>
      <Card className="mb-6 rounded-xl border-zinc-100 shadow-none">
        <CardHeader className="px-5 pb-2 pt-5">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="mt-1 h-3 w-40" />
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <Skeleton className="h-[260px] w-full" />
        </CardContent>
      </Card>
      <Card className="overflow-hidden rounded-xl border-zinc-100 shadow-none">
        <div className="border-b border-zinc-100 px-5 py-3">
          <div className="flex gap-8">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-16" />
            ))}
          </div>
        </div>
        <div className="divide-y divide-zinc-50">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-8 px-5 py-3">
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
