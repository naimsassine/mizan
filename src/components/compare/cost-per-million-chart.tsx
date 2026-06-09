"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Cell,
} from "recharts"

interface ChartRow {
  label: string
  costPer1M: number
  provider: string
}

const PROVIDER_COLORS: Record<string, string> = {
  openai: "#10b981",
  anthropic: "#f97316",
  gemini: "#3b82f6",
  bedrock: "#eab308",
  groq: "#ef4444",
  mistral: "#a855f7",
  grok: "#94a3b8",
  kimi: "#6366f1",
  openrouter: "#f43f5e",
  litellm: "#84cc16",
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { value: number }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-zinc-100 bg-white px-3 py-2.5 shadow-md text-xs">
      <p className="mb-1 text-zinc-400 truncate max-w-[180px]">{label}</p>
      <p className="font-mono font-semibold text-zinc-900">${payload[0].value.toFixed(4)}/1M tokens</p>
    </div>
  )
}

export function CostPerMillionChart({ data }: { data: ChartRow[] }) {
  if (!data.length) return null

  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 34)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
        barSize={14}
      >
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fill: "#a1a1aa" }}
          tickFormatter={(v) => `$${v}`}
        />
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fill: "#52525b" }}
          width={150}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f4f4f5" }} />
        <Bar dataKey="costPer1M" radius={[0, 3, 3, 0]}>
          {data.map((row, i) => (
            <Cell key={i} fill={PROVIDER_COLORS[row.provider] ?? "#d4d4d8"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
