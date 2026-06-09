"use client"

import { useState } from "react"
import { CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AcknowledgeButton } from "@/components/notifications/acknowledge-button"
import { formatDistanceToNow } from "date-fns"

interface Alert {
  id: string
  spendUsd: number | string
  triggeredAt: Date
  acknowledgedAt: Date | null
  budgetRule: {
    provider: string | null
    period: string
    limitUsd: number | string
  }
}

interface Props {
  alerts: Alert[]
  providerColors: Record<string, string>
  providerLabel: Record<string, string>
}

const PAGE_SIZE = 10

export function AlertHistoryList({ alerts, providerColors, providerLabel }: Props) {
  const [shown, setShown] = useState(PAGE_SIZE)
  const visible = alerts.slice(0, shown)
  const hasMore = alerts.length > shown

  return (
    <CardContent className="px-0 pb-0">
      <div className="divide-y divide-zinc-50">
        {visible.map((alert) => (
          <div
            key={alert.id}
            className={`flex items-center justify-between px-5 py-3.5 ${!alert.acknowledgedAt ? "bg-red-50/40" : ""}`}
          >
            <div className="space-y-0.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {!alert.acknowledgedAt && (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                )}
                <span className="font-mono text-xs font-semibold text-zinc-900">
                  ${Number(alert.spendUsd).toFixed(2)} spent
                </span>
                <span className="text-xs text-zinc-400">
                  vs ${Number(alert.budgetRule.limitUsd).toFixed(2)}{" "}
                  {alert.budgetRule.period} limit
                </span>
                {alert.budgetRule.provider && (
                  <Badge
                    variant="outline"
                    className={`h-4 px-1.5 py-0 text-[10px] ${providerColors[alert.budgetRule.provider] ?? "bg-zinc-50 text-zinc-600 border-zinc-200"}`}
                  >
                    {providerLabel[alert.budgetRule.provider] ?? alert.budgetRule.provider}
                  </Badge>
                )}
              </div>
              <p className="pl-3.5 text-[11px] text-zinc-400">
                {formatDistanceToNow(alert.triggeredAt, { addSuffix: true })}
                {alert.acknowledgedAt &&
                  ` · acknowledged ${formatDistanceToNow(alert.acknowledgedAt, { addSuffix: true })}`}
              </p>
            </div>
            {!alert.acknowledgedAt && <AcknowledgeButton id={alert.id} />}
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="border-t border-zinc-50 px-5 py-3">
          <button
            onClick={() => setShown((s) => s + PAGE_SIZE)}
            className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
          >
            Show {Math.min(PAGE_SIZE, alerts.length - shown)} more
            <span className="ml-1 text-zinc-300">({alerts.length - shown} remaining)</span>
          </button>
        </div>
      )}
    </CardContent>
  )
}
