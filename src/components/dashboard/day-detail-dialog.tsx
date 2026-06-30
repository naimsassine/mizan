"use client"

import { useEffect, useState } from "react"
import { format, parseISO } from "date-fns"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { DayBreakdown } from "@/lib/day-breakdown"

const providerDot: Record<string, string> = {
  openai: "bg-emerald-400",
  anthropic: "bg-orange-400",
  gemini: "bg-blue-400",
  bedrock: "bg-yellow-400",
  groq: "bg-red-400",
  mistral: "bg-purple-400",
  grok: "bg-slate-400",
  openrouter: "bg-rose-400",
  litellm: "bg-lime-400",
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function DayDetailDialog({
  date,
  onClose,
}: {
  /** yyyy-MM-dd to inspect, or null to keep the dialog closed */
  date: string | null
  onClose: () => void
}) {
  // Result is tagged with the date it belongs to, so loading/error are derived from whether the
  // latest result matches the currently-open date — avoids synchronous setState in the effect.
  const [result, setResult] = useState<
    { date: string; data: DayBreakdown } | { date: string; error: string } | null
  >(null)

  useEffect(() => {
    if (!date) return
    const ctrl = new AbortController()
    fetch(`/api/usage/day?date=${date}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: DayBreakdown) => setResult({ date, data: d }))
      .catch((e) => {
        if (e.name !== "AbortError") setResult({ date, error: "Couldn’t load this day’s breakdown." })
      })
    return () => ctrl.abort()
  }, [date])

  const current = date && result?.date === date ? result : null
  const loading = date !== null && !current
  const data = current && "data" in current ? current.data : null
  const error = current && "error" in current ? current.error : null

  const isEmpty =
    data && data.apiRecords.length === 0 && data.receipts.length === 0 && data.subscriptions.length === 0

  return (
    <Dialog open={date !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-zinc-900">
            {date ? `Spend on ${format(parseISO(date), "MMM d, yyyy")}` : "Spend"}
          </DialogTitle>
        </DialogHeader>

        {loading && <p className="py-6 text-center text-sm text-zinc-400">Loading…</p>}
        {error && <p className="py-6 text-center text-sm text-red-500">{error}</p>}

        {data && !loading && (
          <div className="min-w-0 space-y-4">
            {/* Total */}
            <div className="flex items-baseline justify-between border-b border-zinc-100 pb-3">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">Total</span>
              <span className="font-mono text-xl font-semibold tabular-nums text-zinc-900">
                ${data.total.toFixed(2)}
              </span>
            </div>

            {isEmpty && (
              <p className="py-4 text-center text-sm text-zinc-400">No spend recorded on this day.</p>
            )}

            {/* API usage */}
            {data.apiRecords.length > 0 && (
              <Section title="API usage" total={data.apiTotal}>
                {data.apiRecords.map((r, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-1.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${providerDot[r.provider] ?? "bg-zinc-300"}`}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-zinc-700">{r.model}</p>
                        <p className="text-[11px] text-zinc-400">
                          {r.provider} · {formatTokens(r.inputTokens)} in · {formatTokens(r.outputTokens)} out
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-zinc-700">
                      ${r.costUsd.toFixed(2)}
                    </span>
                  </li>
                ))}
              </Section>
            )}

            {/* Receipts */}
            {data.receipts.length > 0 && (
              <Section title="Receipts" total={data.receiptTotal}>
                {data.receipts.map((r, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-1.5">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-zinc-700">
                        {r.provider ?? "Unknown"}{" "}
                        <span className="font-normal text-zinc-400">· {r.usageType}</span>
                      </p>
                      <p className="text-[11px] text-zinc-400">
                        {r.invoiceId ? `Invoice ${r.invoiceId}` : r.source}
                        {!r.counted && " · evidence only"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 font-mono text-xs tabular-nums ${r.counted ? "text-zinc-700" : "text-zinc-300 line-through"}`}
                    >
                      ${r.amountUsd.toFixed(2)}
                    </span>
                  </li>
                ))}
              </Section>
            )}

            {/* Subscriptions */}
            {data.subscriptions.length > 0 && (
              <Section title="Subscriptions (amortized)" total={data.subscriptionTotal}>
                {data.subscriptions.map((s, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-1.5">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-zinc-700">{s.provider}</p>
                      <p className="text-[11px] text-zinc-400">
                        ${s.amountUsd.toFixed(2)}/{s.period} · day&apos;s share
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-zinc-700">
                      ${s.dailyShare.toFixed(2)}
                    </span>
                  </li>
                ))}
              </Section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Section({
  title,
  total,
  children,
}: {
  title: string
  total: number
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">{title}</p>
        <p className="font-mono text-xs tabular-nums text-zinc-400">${total.toFixed(2)}</p>
      </div>
      <ul className="divide-y divide-zinc-50">{children}</ul>
    </div>
  )
}
