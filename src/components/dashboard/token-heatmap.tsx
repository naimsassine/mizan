"use client"

import { useMemo, useState } from "react"
import { addDays, format, parseISO, startOfWeek, subWeeks } from "date-fns"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DayDetailDialog } from "@/components/dashboard/day-detail-dialog"

interface ActivityDay {
  date: string // yyyy-MM-dd
  tokens: number
  cost: number
}

interface TokenHeatmapProps {
  /** Days with usage in the last year. Zero-usage days can be omitted — the grid fills them in. */
  days: ActivityDay[]
  /** Today's date (yyyy-MM-dd), computed server-side to keep SSR/CSR deterministic. */
  endDate: string
}

interface Cell {
  key: string
  tokens: number
  cost: number
  level: number
}

const WEEKS = 53

// Light + dark swatches per intensity level (0 = no usage).
const LEVEL_CLASS = [
  "bg-zinc-100 dark:bg-zinc-800/60",
  "bg-emerald-200 dark:bg-emerald-900",
  "bg-emerald-300 dark:bg-emerald-700",
  "bg-emerald-400 dark:bg-emerald-600",
  "bg-emerald-500 dark:bg-emerald-400",
]

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function TokenHeatmap({ days, endDate }: TokenHeatmapProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const { weeks, activeDays, totalTokens } = useMemo(() => {
    const map = new Map(days.map((d) => [d.date, d]))
    const end = parseISO(endDate)
    // GitHub-style: columns are weeks (Sun–Sat). Anchor the grid to the Sunday
    // that starts the window so the rightmost column ends on today.
    const start = startOfWeek(subWeeks(end, WEEKS - 1), { weekStartsOn: 0 })

    // Quartile thresholds over non-zero days, so the scale adapts to the user's volume.
    const values = days
      .map((d) => d.tokens)
      .filter((t) => t > 0)
      .sort((a, b) => a - b)
    const q = (p: number) => values[Math.min(values.length - 1, Math.floor(p * values.length))] ?? 0
    const t1 = q(0.25)
    const t2 = q(0.5)
    const t3 = q(0.75)
    const level = (tokens: number) => {
      if (tokens <= 0) return 0
      if (tokens <= t1) return 1
      if (tokens <= t2) return 2
      if (tokens <= t3) return 3
      return 4
    }

    const weeks: (Cell | null)[][] = []
    let cursor = start
    let activeDays = 0
    let totalTokens = 0
    for (let w = 0; w < WEEKS; w++) {
      const week: (Cell | null)[] = []
      for (let d = 0; d < 7; d++) {
        if (cursor > end) {
          week.push(null) // future days in the current (partial) week
        } else {
          const key = format(cursor, "yyyy-MM-dd")
          const hit = map.get(key)
          const tokens = hit?.tokens ?? 0
          if (tokens > 0) {
            activeDays++
            totalTokens += tokens
          }
          week.push({ key, tokens, cost: hit?.cost ?? 0, level: level(tokens) })
        }
        cursor = addDays(cursor, 1)
      }
      weeks.push(week)
    }
    return { weeks, activeDays, totalTokens }
  }, [days, endDate])

  // Month label sits at the first week whose month differs from the previous column.
  const monthLabels = useMemo(() => {
    const monthOf = (week: (Cell | null)[]) => {
      const first = week.find(Boolean)
      return first ? format(parseISO(first.key), "MMM") : ""
    }
    return weeks.map((week, i) => {
      const m = monthOf(week)
      if (!m) return ""
      const prev = i > 0 ? monthOf(weeks[i - 1]) : ""
      return m !== prev ? m : ""
    })
  }, [weeks])

  return (
    <Card className="rounded-xl border-zinc-100 bg-white shadow-none">
      <CardHeader className="px-5 pb-3 pt-5">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium text-zinc-900">Token activity</p>
          <p className="text-xs text-zinc-400">
            {activeDays} {activeDays === 1 ? "day" : "days"} of usage ·{" "}
            {formatTokens(totalTokens)} tokens in the last year
          </p>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <div className="overflow-x-auto">
          <div className="mx-auto flex w-max flex-col gap-1.5">
            {/* Month labels */}
            <div className="flex gap-[3px] pl-7">
              {monthLabels.map((label, i) => (
                <div key={i} className="relative h-3 w-2.5">
                  {label && (
                    <span className="absolute left-0 top-0 whitespace-nowrap text-[10px] text-zinc-400">
                      {label}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-[3px]">
              {/* Day-of-week labels (Sun-anchored grid: rows 1/3/5 = Mon/Wed/Fri) */}
              <div className="mr-1 grid w-6 grid-rows-7 gap-[3px] text-[10px] text-zinc-400">
                <span />
                <span className="leading-[10px]">Mon</span>
                <span />
                <span className="leading-[10px]">Wed</span>
                <span />
                <span className="leading-[10px]">Fri</span>
                <span />
              </div>

              {/* Week columns */}
              {weeks.map((week, wi) => (
                <div key={wi} className="grid grid-rows-7 gap-[3px]">
                  {week.map((cell, di) =>
                    cell === null ? (
                      <div key={di} className="h-2.5 w-2.5" />
                    ) : (
                      <Tooltip key={di}>
                        <TooltipTrigger
                          onClick={() => setSelectedDate(cell.key)}
                          className={`h-2.5 w-2.5 cursor-pointer rounded-[2px] transition-transform hover:scale-125 ${LEVEL_CLASS[cell.level]}`}
                          aria-label={`${formatTokens(cell.tokens)} tokens on ${format(parseISO(cell.key), "MMM d, yyyy")} — view breakdown`}
                        />
                        <TooltipContent side="top" className="text-xs">
                          {cell.tokens > 0 ? (
                            <>
                              <span className="font-medium">{formatTokens(cell.tokens)} tokens</span>
                              {cell.cost > 0 && <span> · ${cell.cost.toFixed(2)}</span>}
                              <span className="text-background/60">
                                {" "}
                                · {format(parseISO(cell.key), "MMM d, yyyy")}
                              </span>
                            </>
                          ) : (
                            <span className="text-background/60">
                              No usage · {format(parseISO(cell.key), "MMM d, yyyy")}
                            </span>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    ),
                  )}
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="flex items-center justify-end gap-1.5 pt-1 text-[10px] text-zinc-400">
              <span>Less</span>
              {LEVEL_CLASS.map((c, i) => (
                <span key={i} className={`h-2.5 w-2.5 rounded-[2px] ${c}`} />
              ))}
              <span>More</span>
            </div>
          </div>
        </div>
      </CardContent>

      <DayDetailDialog date={selectedDate} onClose={() => setSelectedDate(null)} />
    </Card>
  )
}
