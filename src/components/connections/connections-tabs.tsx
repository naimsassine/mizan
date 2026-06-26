"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

interface Props {
  apiContent: React.ReactNode
  subscriptionContent: React.ReactNode
  apiAddSlot: React.ReactNode
  subscriptionAddSlot: React.ReactNode
  apiCount: number
  subscriptionCount: number
}

const TABS = [
  {
    key: "api" as const,
    label: "API Spend",
    explainer: "Pay-per-token usage from your providers — tracked granularly with an admin API key, or from receipts and manual entries.",
  },
  {
    key: "subscriptions" as const,
    label: "Subscriptions",
    explainer: "Flat-rate AI plans (ChatGPT Plus, Cursor, Copilot…). Added once and projected forward every billing period.",
  },
]

export function ConnectionsTabs({
  apiContent,
  subscriptionContent,
  apiAddSlot,
  subscriptionAddSlot,
  apiCount,
  subscriptionCount,
}: Props) {
  const [tab, setTab] = useState<"api" | "subscriptions">("api")
  const active = TABS.find((t) => t.key === tab)!

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-0.5 rounded-lg border border-zinc-100 bg-zinc-50 p-0.5">
          {TABS.map((t) => {
            const count = t.key === "api" ? apiCount : subscriptionCount
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150",
                  tab === t.key
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-700",
                )}
              >
                {t.label}
                {count > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[10px] tabular-nums",
                      tab === t.key ? "bg-zinc-100 text-zinc-600" : "bg-zinc-200/60 text-zinc-500",
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div>{tab === "api" ? apiAddSlot : subscriptionAddSlot}</div>
      </div>

      <p className="mb-5 max-w-2xl text-xs leading-relaxed text-zinc-500">{active.explainer}</p>

      {tab === "api" ? apiContent : subscriptionContent}
    </div>
  )
}
