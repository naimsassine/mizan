import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface ModelRow {
  model: string
  provider: string
  costUsd: number
  totalTokens: number
  pct: number
}

interface ModelBreakdownProps {
  rows: ModelRow[]
}

const providerColors: Record<string, string> = {
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

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

export function ModelBreakdown({ rows }: ModelBreakdownProps) {
  return (
    <Card className="rounded-xl border-zinc-100 bg-white shadow-none">
      <CardHeader className="px-5 pb-3 pt-5">
        <p className="text-sm font-medium text-zinc-900">By model — this month</p>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-xs text-zinc-400">No usage data yet</p>
        ) : (
          <div className="space-y-4">
            {rows.map((row, i) => (
              <div key={`${row.provider}-${row.model}`} className="flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-medium text-zinc-900 truncate">{row.model}</span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 h-4 ${providerColors[row.provider] ?? "bg-zinc-50 text-zinc-600 border-zinc-200"}`}
                    >
                      {row.provider}
                    </Badge>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-zinc-100 overflow-hidden">
                    <div
                      className="h-1.5 rounded-full bg-zinc-900"
                      style={{
                        width: `${row.pct}%`,
                        transformOrigin: "left",
                        animation: `expand-bar 0.7s cubic-bezier(0.4, 0, 0.2, 1) ${i * 80}ms both`,
                      }}
                    />
                  </div>
                </div>
                <div className="text-right shrink-0 min-w-[64px]">
                  <p className="font-mono text-xs font-semibold text-zinc-900 tabular-nums">
                    ${row.costUsd.toFixed(2)}
                  </p>
                  <p className="text-[10px] text-zinc-400 tabular-nums">
                    {row.pct.toFixed(0)}% · {formatTokens(row.totalTokens)} tok
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
