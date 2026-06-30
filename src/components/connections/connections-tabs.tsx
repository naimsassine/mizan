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
        <div className="inline-flex items-center gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800">
          {TABS.map((t) => {
            const count = t.key === "api" ? apiCount : subscriptionCount
            const isActive = tab === t.key
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-pressed={isActive}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-zinc-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-500 hover:bg-white/60 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-700/60",
                )}
              >
                {t.label}
                {count > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[10px] font-semibold tabular-nums",
                      isActive
                        ? "bg-white/20 text-white dark:bg-zinc-900/15 dark:text-zinc-900"
                        : "bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-300",
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

      {/* key={tab} remounts on switch so the enter animation replays each time */}
      <div key={tab} className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300 ease-out">
        <p className="mb-5 max-w-2xl text-xs leading-relaxed text-zinc-500">{active.explainer}</p>
        {tab === "api" ? apiContent : subscriptionContent}
      </div>
    </div>
  )
}
