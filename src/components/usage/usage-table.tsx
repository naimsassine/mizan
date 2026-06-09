"use client"

import { useState, useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react"
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

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc")
    } else {
      setSortKey(key)
      setSortDir("desc")
    }
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

  function th(label: string, key: SortKey, align: "left" | "right" = "left") {
    const active = sortKey === key
    return (
      <th
        className={`px-5 py-3 text-xs font-medium uppercase tracking-wide text-zinc-400 cursor-pointer select-none hover:text-zinc-600 transition-colors ${align === "right" ? "text-right" : "text-left"}`}
        onClick={() => toggleSort(key)}
      >
        <span className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}>
          {label}
          <SortIcon active={active} dir={sortDir} />
        </span>
      </th>
    )
  }

  return (
    <div className="overflow-x-auto">
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
        <tbody className="divide-y divide-zinc-50">
          {sorted.map((row, i) => (
            <tr
              key={`${String(row.date)}-${row.model}-${i}`}
              className="transition-colors duration-100 hover:bg-zinc-50/70"
            >
              <td className="px-5 py-3 text-xs text-zinc-500">{format(row.date, "MMM d, yyyy")}</td>
              <td className="max-w-[200px] px-5 py-3">
                <span className="block truncate font-mono text-xs font-medium text-zinc-900">{row.model}</span>
              </td>
              <td className="px-5 py-3">
                <Badge variant="outline" className={`h-4 px-1.5 py-0 text-[10px] ${providerColors[row.provider] ?? ""}`}>
                  {row.provider}
                </Badge>
              </td>
              <td className="px-5 py-3 text-right font-mono text-xs tabular-nums text-zinc-600">
                {formatTokens(row.inputTokens)}
              </td>
              <td className="px-5 py-3 text-right font-mono text-xs tabular-nums text-zinc-600">
                {formatTokens(row.outputTokens)}
              </td>
              <td className="px-5 py-3 text-right font-mono text-xs font-semibold tabular-nums text-zinc-900">
                ${row.costUsd.toFixed(4)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-zinc-100 bg-zinc-50/60">
            <td colSpan={3} className="px-5 py-3 text-xs font-medium text-zinc-500">
              {rows.length} {rows.length === 1 ? "row" : "rows"}
            </td>
            <td className="px-5 py-3 text-right font-mono text-xs tabular-nums text-zinc-600">
              {formatTokens(totalInputTokens)}
            </td>
            <td className="px-5 py-3 text-right font-mono text-xs tabular-nums text-zinc-600">
              {formatTokens(totalOutputTokens)}
            </td>
            <td className="px-5 py-3 text-right font-mono text-xs font-semibold tabular-nums text-zinc-900">
              ${totalCost.toFixed(4)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
