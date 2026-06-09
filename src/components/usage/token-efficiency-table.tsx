import { Badge } from "@/components/ui/badge"

export interface EfficiencyRow {
  model: string
  provider: string
  inputTokens: number
  outputTokens: number
  costUsd: number
}

const PROVIDER_LABEL: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
  bedrock: "Bedrock",
  groq: "Groq",
  mistral: "Mistral",
  grok: "xAI",
  kimi: "Kimi",
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
  kimi: "bg-indigo-50 text-indigo-700 border-indigo-100",
  openrouter: "bg-rose-50 text-rose-700 border-rose-100",
  litellm: "bg-lime-50 text-lime-700 border-lime-100",
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function efficiencyLabel(ratio: number): { label: string; className: string } {
  if (ratio < 0.15)
    return { label: "Input heavy", className: "bg-amber-50 text-amber-700 border-amber-100" }
  if (ratio < 0.5)
    return { label: "Prompt-led", className: "bg-zinc-50 text-zinc-600 border-zinc-200" }
  if (ratio < 1.5)
    return { label: "Balanced", className: "bg-zinc-50 text-zinc-500 border-zinc-200" }
  return { label: "Output rich", className: "bg-emerald-50 text-emerald-700 border-emerald-100" }
}

export function TokenEfficiencyTable({ rows }: { rows: EfficiencyRow[] }) {
  if (!rows.length) return null

  const sorted = [...rows]
    .filter((r) => r.inputTokens > 0)
    .sort((a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens))

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-100">
            <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-400">
              Model
            </th>
            <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-400">
              Provider
            </th>
            <th className="hidden sm:table-cell px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-zinc-400">
              Input
            </th>
            <th className="hidden sm:table-cell px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-zinc-400">
              Output
            </th>
            <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-zinc-400">
              Out/In ratio
            </th>
            <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-zinc-400">
              Signal
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-50">
          {sorted.map((row, i) => {
            const ratio = row.outputTokens > 0 ? row.outputTokens / row.inputTokens : 0
            const { label, className } = efficiencyLabel(ratio)
            return (
              <tr key={i} className="transition-colors duration-100 hover:bg-zinc-50/70">
                <td className="px-5 py-3 font-mono text-xs text-zinc-700 max-w-[160px] truncate">
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
                <td className="hidden sm:table-cell px-5 py-3 text-right font-mono text-xs tabular-nums text-zinc-500">
                  {formatTokens(row.inputTokens)}
                </td>
                <td className="hidden sm:table-cell px-5 py-3 text-right font-mono text-xs tabular-nums text-zinc-500">
                  {formatTokens(row.outputTokens)}
                </td>
                <td className="px-5 py-3 text-right font-mono text-xs font-semibold tabular-nums text-zinc-900">
                  {ratio.toFixed(2)}
                </td>
                <td className="px-5 py-3 text-right">
                  <Badge variant="outline" className={`h-4 px-1.5 py-0 text-[10px] ${className}`}>
                    {label}
                  </Badge>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="px-5 py-3 text-[10px] text-zinc-400 border-t border-zinc-50">
        Output/Input ratio: higher = more generation per prompt token. &quot;Input heavy&quot; (&lt;0.15) may indicate verbose system prompts worth optimising.
      </p>
    </div>
  )
}
