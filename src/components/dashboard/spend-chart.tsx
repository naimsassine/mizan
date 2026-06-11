"use client"

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts"
import { format, parseISO } from "date-fns"
import { useTheme } from "next-themes"

interface SpendDataPoint {
  date: string
  api: number
  subscription: number
}

interface SpendChartProps {
  data: SpendDataPoint[]
}

interface TooltipPayload {
  name: string
  value: number
  fill: string
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: TooltipPayload[]
  label?: string
}) {
  if (!active || !payload?.length || !label) return null
  const barPayload = payload.filter((p) => p.name === "api" || p.name === "subscription")
  const avgPayload = payload.find((p) => p.name === "avg")
  const total = barPayload.reduce((s, p) => s + (p.value ?? 0), 0)
  const hasSubscription = barPayload.some((p) => p.name === "subscription" && p.value > 0)
  return (
    <div className="rounded-lg border border-zinc-100 bg-white dark:bg-zinc-800 dark:border-zinc-700 px-3 py-2.5 shadow-md text-xs">
      <p className="mb-1 text-zinc-400">{format(parseISO(label), "MMM d, yyyy")}</p>
      <p className="font-mono font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">${total.toFixed(2)}</p>
      {hasSubscription && (
        <div className="mt-1.5 space-y-0.5 border-t border-zinc-100 dark:border-zinc-700 pt-1.5">
          {barPayload.map((p) =>
            p.value > 0 ? (
              <div key={p.name} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-sm" style={{ background: p.fill }} />
                  <span className="capitalize text-zinc-400">{p.name}</span>
                </div>
                <span className="font-mono tabular-nums text-zinc-600 dark:text-zinc-400">${p.value.toFixed(2)}</span>
              </div>
            ) : null,
          )}
        </div>
      )}
      {avgPayload && avgPayload.value > 0 && (
        <div className="mt-1.5 flex items-center justify-between gap-4 border-t border-zinc-100 dark:border-zinc-700 pt-1.5">
          <span className="text-zinc-400">7-day avg</span>
          <span className="font-mono tabular-nums text-zinc-600 dark:text-zinc-400">${avgPayload.value.toFixed(2)}</span>
        </div>
      )}
    </div>
  )
}

export function SpendChart({ data }: SpendChartProps) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  const apiFill = isDark ? "#e4e4e7" : "#18181b"
  const subFill = isDark ? "#52525b" : "#d4d4d8"
  const cursorFill = isDark ? "#27272a" : "#f4f4f5"
  const avgStroke = isDark ? "#f59e0b" : "#d97706"

  if (!data.length) {
    return (
      <div className="flex h-52 items-center justify-center text-xs text-zinc-400">
        No spend data yet
      </div>
    )
  }

  // 7-day trailing moving average of total daily spend, shown once there's enough history.
  const showAvg = data.length >= 7
  const chartData = data.map((d, i) => {
    const window = data.slice(Math.max(0, i - 6), i + 1)
    const avg = window.reduce((s, p) => s + p.api + p.subscription, 0) / window.length
    return { ...d, avg: showAvg ? avg : 0 }
  })

  return (
    <div>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={chartData} barSize={8} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10, fill: "#a1a1aa" }}
            tickFormatter={(v) => format(parseISO(v), "MMM d")}
            interval="preserveStartEnd"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10, fill: "#a1a1aa" }}
            tickFormatter={(v) => `$${v}`}
            width={36}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: cursorFill, radius: 4 }}
          />
          <Bar dataKey="api" name="api" stackId="spend" fill={apiFill} radius={[0, 0, 0, 0]} />
          <Bar dataKey="subscription" name="subscription" stackId="spend" fill={subFill} radius={[3, 3, 0, 0]} />
          {showAvg && (
            <Line
              type="monotone"
              dataKey="avg"
              name="avg"
              stroke={avgStroke}
              strokeWidth={1.5}
              dot={false}
              strokeDasharray="4 3"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      {showAvg && (
        <div className="mt-2 flex items-center justify-end gap-1.5">
          <span className="h-0.5 w-4" style={{ background: avgStroke }} />
          <span className="text-[10px] text-zinc-400">7-day moving average</span>
        </div>
      )}
    </div>
  )
}
