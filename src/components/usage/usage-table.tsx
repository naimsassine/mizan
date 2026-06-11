"use client"

import { useState, useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { ChevronUp, ChevronDown, ChevronsUpDown, Rows3, CalendarDays } from "lucide-react"
import { format } from "date-fns"

interface UsageRow {
  date: Date
  model: string
  provider: string
  inputTokens: number
  outputTokens: number
  costUsd: number
}

interface UsageTableProps {
  rows: UsageRow[]
  totalCost: number
  totalInputTokens: number
  totalOutputTokens: number
  providerColors: Record<string, string>
}

type SortKey = "date" | "model" | "provider" | "inputTokens" | "outputTokens" | "costUsd"
type SortDir = "asc" | "desc"

const PAGE_SIZE = 50

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown className="h-3 w-3 text-zinc-300" />
  return dir === "asc"
    ? <ChevronUp className="h-3 w-3 text-zinc-600" />
    : <ChevronDown className="h-3 w-3 text-zinc-600" />
}

export function UsageTable({ rows, totalCost, totalInputTokens, totalOutputTokens, providerColors }: UsageTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("date")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [grouped, setGrouped] = useState(true)
  const [page, setPage] = useState(1)

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc")
    } else {
      setSortKey(key)
      setSortDir("desc")
    }
    setPage(1)
  }

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case "date": cmp = a.date.getTime() - b.date.getTime(); break
        case "model": cmp = a.model.localeCompare(b.model); break
        case "provider": cmp = a.provider.localeCompare(b.provider); break
        case "inputTokens": cmp = a.inputTokens - b.inputTokens; break
        case "outputTokens": cmp = a.outputTokens - b.outputTokens; break
        case "costUsd": cmp = a.costUsd - b.costUsd; break
      }
      return sortDir === "asc" ? cmp : -cmp
    })
  }, [rows, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paged = useMemo(
    () => sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [sorted, currentPage],
  )

  // Group the visible page by date when grouping is enabled and sorting by date.
  const groups = useMemo(() => {
    if (!grouped || sortKey !== "date") return null
    const map = new Map<string, { date: Date; rows: UsageRow[]; cost: number; input: number; output: number }>()
    for (const r of paged) {
      const key = format(r.date, "yyyy-MM-dd")
      const g = map.get(key) ?? { date: r.date, rows: [], cost: 0, input: 0, output: 0 }
      g.rows.push(r)
      g.cost += r.costUsd
      g.input += r.inputTokens
      g.output += r.outputTokens
      map.set(key, g)
    }
    return Array.from(map.values())
  }, [paged, grouped, sortKey])

  function th(label: string, key: SortKey, align: "left" | "right" = "left") {
    const active = sortKey === key
    return (
      <th
        scope="col"
        aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
        className={`px-5 py-3 text-xs font-medium uppercase tracking-wide text-zinc-500 ${align === "right" ? "text-right" : "text-left"}`}
      >
        <button
          type="button"
          onClick={() => toggleSort(key)}
          className={`inline-flex items-center gap-1 select-none rounded-sm hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${align === "right" ? "flex-row-reverse" : ""}`}
        >
          {label}
          <SortIcon active={active} dir={sortDir} />
        </button>
      </th>
    )
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-5 py-2.5">
        <span className="text-xs text-zinc-400">
          {sorted.length} {sorted.length === 1 ? "row" : "rows"}
        </span>
        <button
          type="button"
          onClick={() => setGrouped((g) => !g)}
          disabled={sortKey !== "date"}
          title={sortKey !== "date" ? "Sort by date to group" : grouped ? "Show flat list" : "Group by day"}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-500 transition-colors hover:border-zinc-300 hover:text-zinc-900 disabled:opacity-40 dark:border-zinc-800"
        >
          {grouped && sortKey === "date" ? (
            <><CalendarDays className="h-3 w-3" /> Grouped by day</>
          ) : (
            <><Rows3 className="h-3 w-3" /> Flat list</>
          )}
        </button>
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100">
              {th("Date", "date")}
              {th("Model", "model")}
              {th("Provider", "provider")}
              {th("Input", "inputTokens", "right")}
              {th("Output", "outputTokens", "right")}
              {th("Cost", "costUsd", "right")}
            </tr>
          </thead>
          {groups ? (
            groups.map((g) => (
              <tbody key={format(g.date, "yyyy-MM-dd")} className="divide-y divide-zinc-50">
                <tr className="bg-zinc-50/60">
                  <td colSpan={3} className="px-5 py-2 text-xs font-medium text-zinc-600">
                    {format(g.date, "EEEE, MMM d, yyyy")}
                  </td>
                  <td className="px-5 py-2 text-right font-mono text-xs tabular-nums text-zinc-500">{formatTokens(g.input)}</td>
                  <td className="px-5 py-2 text-right font-mono text-xs tabular-nums text-zinc-500">{formatTokens(g.output)}</td>
                  <td className="px-5 py-2 text-right font-mono text-xs font-semibold tabular-nums text-zinc-700">${g.cost.toFixed(2)}</td>
                </tr>
                {g.rows.map((row, i) => (
                  <tr key={`${row.model}-${i}`} className="transition-colors duration-100 hover:bg-zinc-50/70">
                    <td className="px-5 py-3" />
                    <td className="max-w-[200px] px-5 py-3">
                      <span className="block truncate font-mono text-xs font-medium text-zinc-900">{row.model}</span>
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant="outline" className={`h-4 px-1.5 py-0 text-[10px] capitalize ${providerColors[row.provider] ?? ""}`}>
                        {row.provider}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-xs tabular-nums text-zinc-600">{formatTokens(row.inputTokens)}</td>
                    <td className="px-5 py-3 text-right font-mono text-xs tabular-nums text-zinc-600">{formatTokens(row.outputTokens)}</td>
                    <td className="px-5 py-3 text-right font-mono text-xs font-semibold tabular-nums text-zinc-900">${row.costUsd.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            ))
          ) : (
            <tbody className="divide-y divide-zinc-50">
              {paged.map((row, i) => (
                <tr key={`${String(row.date)}-${row.model}-${i}`} className="transition-colors duration-100 hover:bg-zinc-50/70">
                  <td className="px-5 py-3 text-xs text-zinc-500">{format(row.date, "MMM d, yyyy")}</td>
                  <td className="max-w-[200px] px-5 py-3">
                    <span className="block truncate font-mono text-xs font-medium text-zinc-900">{row.model}</span>
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant="outline" className={`h-4 px-1.5 py-0 text-[10px] capitalize ${providerColors[row.provider] ?? ""}`}>
                      {row.provider}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-xs tabular-nums text-zinc-600">{formatTokens(row.inputTokens)}</td>
                  <td className="px-5 py-3 text-right font-mono text-xs tabular-nums text-zinc-600">{formatTokens(row.outputTokens)}</td>
                  <td className="px-5 py-3 text-right font-mono text-xs font-semibold tabular-nums text-zinc-900">${row.costUsd.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          )}
          <tfoot>
            <tr className="border-t border-zinc-100 bg-zinc-50/60">
              <td colSpan={3} className="px-5 py-3 text-xs font-medium text-zinc-500">All rows</td>
              <td className="px-5 py-3 text-right font-mono text-xs tabular-nums text-zinc-600">{formatTokens(totalInputTokens)}</td>
              <td className="px-5 py-3 text-right font-mono text-xs tabular-nums text-zinc-600">{formatTokens(totalOutputTokens)}</td>
              <td className="px-5 py-3 text-right font-mono text-xs font-semibold tabular-nums text-zinc-900">${totalCost.toFixed(4)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="divide-y divide-zinc-50 sm:hidden">
        {paged.map((row, i) => (
          <div key={`${String(row.date)}-${row.model}-${i}`} className="px-5 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-mono text-xs font-medium text-zinc-900">{row.model}</span>
              <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-zinc-900">${row.costUsd.toFixed(4)}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`h-4 px-1.5 py-0 text-[10px] capitalize ${providerColors[row.provider] ?? ""}`}>
                  {row.provider}
                </Badge>
                <span className="text-[11px] text-zinc-400">{format(row.date, "MMM d")}</span>
              </div>
              <span className="font-mono text-[11px] tabular-nums text-zinc-500">
                {formatTokens(row.inputTokens)} in · {formatTokens(row.outputTokens)} out
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-zinc-100 px-5 py-3">
          <span className="text-xs text-zinc-400">Page {currentPage} of {totalPages}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-900 disabled:opacity-40 dark:border-zinc-800"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-900 disabled:opacity-40 dark:border-zinc-800"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
