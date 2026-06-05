import { auth } from "@clerk/nextjs/server"
import { subDays, format } from "date-fns"
import { prisma } from "@/lib/prisma"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { cn } from "@/lib/utils"

const providerColors: Record<string, string> = {
  openai: "bg-emerald-50 text-emerald-700 border-emerald-100",
  anthropic: "bg-orange-50 text-orange-700 border-orange-100",
  gemini: "bg-blue-50 text-blue-700 border-blue-100",
  bedrock: "bg-yellow-50 text-yellow-700 border-yellow-100",
}

const VALID_RANGES = [7, 30, 90] as const
type Range = (typeof VALID_RANGES)[number]

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>
}) {
  const { userId, orgId } = await auth()
  const ownerId = orgId ?? userId!

  const { range: rangeParam } = await searchParams
  const days: Range = (VALID_RANGES as readonly number[]).includes(Number(rangeParam))
    ? (Number(rangeParam) as Range)
    : 30
  const fromDate = subDays(new Date(), days)

  const records = await prisma.usageRecord.groupBy({
    by: ["date", "model", "provider"],
    where: { ownerId, date: { gte: fromDate } },
    _sum: { costUsd: true, inputTokens: true, outputTokens: true },
    orderBy: [{ date: "desc" }],
  })

  const totalCost = records.reduce((s, r) => s + Number(r._sum.costUsd ?? 0), 0)
  const totalTokens = records.reduce(
    (s, r) => s + Number(r._sum.inputTokens ?? 0) + Number(r._sum.outputTokens ?? 0),
    0
  )

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-[1.6rem] font-semibold leading-tight tracking-tight text-zinc-900">
            Usage
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500">Token and spend breakdown by model.</p>
        </div>

        {/* Range selector */}
        <div className="flex items-center gap-0.5 rounded-lg border border-zinc-200 bg-white p-1">
          {VALID_RANGES.map((d) => (
            <Link
              key={d}
              href={`/usage?range=${d}`}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150",
                days === d
                  ? "bg-zinc-900 text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-900"
              )}
            >
              {d}d
            </Link>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <Card className="rounded-xl border-zinc-100 bg-white shadow-none transition-shadow duration-200 hover:shadow-sm">
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Total spend</p>
            <p className="mt-2.5 font-mono text-2xl font-semibold tabular-nums tracking-tight text-zinc-900">
              ${totalCost.toFixed(2)}
            </p>
            <p className="mt-1.5 text-xs text-zinc-400">last {days} days</p>
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

      {/* Table */}
      {records.length === 0 ? (
        <Card className="rounded-xl border-zinc-100 bg-white shadow-none">
          <CardContent className="py-16 text-center">
            <p className="text-sm text-zinc-500">No usage data in the last {days} days.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden rounded-xl border-zinc-100 bg-white shadow-none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-400">
                    Date
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-400">
                    Model
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-400">
                    Provider
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-zinc-400">
                    Input
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-zinc-400">
                    Output
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-zinc-400">
                    Cost
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {records.map((row, i) => (
                  <tr
                    key={`${String(row.date)}-${row.model}-${i}`}
                    className="transition-colors duration-100 hover:bg-zinc-50/70"
                  >
                    <td className="px-5 py-3 text-xs text-zinc-500">
                      {format(row.date, "MMM d, yyyy")}
                    </td>
                    <td className="max-w-[200px] px-5 py-3">
                      <span className="block truncate font-mono text-xs font-medium text-zinc-900">
                        {row.model}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <Badge
                        variant="outline"
                        className={`h-4 px-1.5 py-0 text-[10px] ${providerColors[row.provider] ?? ""}`}
                      >
                        {row.provider}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-xs tabular-nums text-zinc-600">
                      {formatTokens(Number(row._sum.inputTokens ?? 0))}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-xs tabular-nums text-zinc-600">
                      {formatTokens(Number(row._sum.outputTokens ?? 0))}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-xs font-semibold tabular-nums text-zinc-900">
                      ${Number(row._sum.costUsd ?? 0).toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {records.length > 0 && (
                <tfoot>
                  <tr className="border-t border-zinc-100 bg-zinc-50/60">
                    <td colSpan={3} className="px-5 py-3 text-xs font-medium text-zinc-500">
                      {records.length} {records.length === 1 ? "row" : "rows"}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-xs tabular-nums text-zinc-600">
                      {formatTokens(
                        records.reduce((s, r) => s + Number(r._sum.inputTokens ?? 0), 0)
                      )}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-xs tabular-nums text-zinc-600">
                      {formatTokens(
                        records.reduce((s, r) => s + Number(r._sum.outputTokens ?? 0), 0)
                      )}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-xs font-semibold tabular-nums text-zinc-900">
                      ${totalCost.toFixed(4)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
