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
  cost: number
}

interface SpendChartProps {
  data: SpendDataPoint[]
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-zinc-100 bg-white px-3 py-2.5 shadow-md text-xs">
      <p className="text-zinc-400 mb-0.5">{format(parseISO(label), "MMM d, yyyy")}</p>
      <p className="font-mono font-semibold text-zinc-900 tabular-nums">
        ${payload[0].value.toFixed(2)}
      </p>
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
        <Bar dataKey="cost" fill="#18181b" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
