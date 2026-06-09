"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts"
import { format, parseISO } from "date-fns"

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
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0)
  const hasSubscription = payload.some((p) => p.name === "subscription" && p.value > 0)
  return (
    <div className="rounded-lg border border-zinc-100 bg-white px-3 py-2.5 shadow-md text-xs">
      <p className="mb-1 text-zinc-400">{format(parseISO(label), "MMM d, yyyy")}</p>
      <p className="font-mono font-semibold tabular-nums text-zinc-900">${total.toFixed(2)}</p>
      {hasSubscription && (
        <div className="mt-1.5 space-y-0.5 border-t border-zinc-100 pt-1.5">
          {payload.map((p) =>
            p.value > 0 ? (
              <div key={p.name} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-sm" style={{ background: p.fill }} />
                  <span className="capitalize text-zinc-400">{p.name}</span>
                </div>
                <span className="font-mono tabular-nums text-zinc-600">${p.value.toFixed(2)}</span>
              </div>
            ) : null,
          )}
        </div>
      )}
    </div>
  )
}

export function SpendChart({ data }: SpendChartProps) {
  if (!data.length) {
    return (
      <div className="flex h-52 items-center justify-center text-xs text-zinc-400">
        No spend data yet
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} barSize={8} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
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
          cursor={{ fill: "#f4f4f5", radius: 4 }}
        />
        <Bar dataKey="api" name="api" stackId="spend" fill="#18181b" radius={[0, 0, 0, 0]} />
        <Bar dataKey="subscription" name="subscription" stackId="spend" fill="#d4d4d8" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
