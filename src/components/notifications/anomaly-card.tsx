import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, Zap } from "lucide-react"
import { format } from "date-fns"

export interface SpendAnomaly {
  date: Date
  provider: string | null
  prevCost: number
  currCost: number
  multiplier: number
}

const PROVIDER_LABEL: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
  bedrock: "Bedrock",
  groq: "Groq",
  mistral: "Mistral",
  grok: "xAI",
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
  openrouter: "bg-rose-50 text-rose-700 border-rose-100",
  litellm: "bg-lime-50 text-lime-700 border-lime-100",
}

export function AnomalyCard({ anomalies }: { anomalies: SpendAnomaly[] }) {
  return (
    <Card className="rounded-xl border-amber-100 bg-amber-50/40 shadow-none">
      <CardHeader className="px-5 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" strokeWidth={1.5} />
          <p className="text-sm font-medium text-zinc-900">Spend anomalies</p>
          <span className="flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-semibold text-white">
            {anomalies.length}
          </span>
        </div>
        <p className="text-xs text-zinc-500 mt-0.5">
          Days where spend spiked 2× or more vs the previous day.
        </p>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div className="divide-y divide-amber-100">
          {anomalies.map((a, i) => (
            <div key={i} className="flex items-center justify-between px-5 py-3.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <TrendingUp className="h-3.5 w-3.5 text-amber-500 shrink-0" strokeWidth={2} />
                <span className="text-xs font-medium text-zinc-700">
                  {format(a.date, "MMM d, yyyy")}
                </span>
                {a.provider ? (
                  <Badge
                    variant="outline"
                    className={`h-4 px-1.5 py-0 text-[10px] ${PROVIDER_COLORS[a.provider] ?? "bg-zinc-50 text-zinc-600 border-zinc-200"}`}
                  >
                    {PROVIDER_LABEL[a.provider] ?? a.provider}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="h-4 px-1.5 py-0 text-[10px] bg-zinc-50 text-zinc-500 border-zinc-200">
                    All providers
                  </Badge>
                )}
                <span className="text-xs text-zinc-400">
                  <span className="font-mono">${a.prevCost.toFixed(2)}</span>
                  {" → "}
                  <span className="font-mono font-semibold text-zinc-700">${a.currCost.toFixed(2)}</span>
                </span>
              </div>
              <span className="font-mono text-xs font-semibold text-amber-600 shrink-0">
                {a.multiplier.toFixed(1)}×
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
