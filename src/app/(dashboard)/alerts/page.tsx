import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Bell } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { AddRuleDialog } from "@/components/alerts/add-rule-dialog"
import { DeleteRuleButton } from "@/components/alerts/delete-rule-button"
import { AcknowledgeButton } from "@/components/alerts/acknowledge-button"

const providerLabel: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  bedrock: "AWS Bedrock",
}

const providerColors: Record<string, string> = {
  openai: "bg-emerald-50 text-emerald-700 border-emerald-100",
  anthropic: "bg-orange-50 text-orange-700 border-orange-100",
  gemini: "bg-blue-50 text-blue-700 border-blue-100",
  bedrock: "bg-yellow-50 text-yellow-700 border-yellow-100",
}

const periodColors: Record<string, string> = {
  daily: "bg-violet-50 text-violet-700 border-violet-100",
  weekly: "bg-sky-50 text-sky-700 border-sky-100",
  monthly: "bg-indigo-50 text-indigo-700 border-indigo-100",
}

export default async function AlertsPage() {
  const { userId, orgId } = await auth()
  const ownerId = orgId ?? userId!

  const [rules, alerts] = await Promise.all([
    prisma.budgetRule.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      include: {
        alerts: {
          orderBy: { triggeredAt: "desc" },
          take: 1,
          select: { id: true, acknowledgedAt: true },
        },
      },
    }),
    prisma.alert.findMany({
      where: { budgetRule: { ownerId } },
      orderBy: { triggeredAt: "desc" },
      take: 50,
      include: {
        budgetRule: {
          select: { provider: true, period: true, limitUsd: true },
        },
      },
    }),
  ])

  const unackCount = alerts.filter((a) => !a.acknowledgedAt).length

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Alerts</h1>
          <p className="mt-1 text-sm text-zinc-500">Budget rules and spend notifications.</p>
        </div>
        <AddRuleDialog />
      </div>

      <div className="space-y-6">
        {/* Budget rules */}
        <Card className="rounded-xl border-zinc-100 bg-white shadow-none">
          <CardHeader className="px-5 pt-5 pb-3">
            <p className="text-sm font-medium text-zinc-900">Budget rules</p>
          </CardHeader>
          {rules.length === 0 ? (
            <CardContent className="px-5 pb-5">
              <p className="text-xs text-zinc-400">
                No budget rules yet. Add one above to start receiving alerts.
              </p>
            </CardContent>
          ) : (
            <CardContent className="px-0 pb-0">
              <div className="divide-y divide-zinc-50">
                {rules.map((rule) => (
                  <div key={rule.id} className="flex items-center justify-between px-5 py-3.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <Badge
                        variant="outline"
                        className={`h-5 px-1.5 py-0 text-[10px] ${periodColors[rule.period] ?? ""}`}
                      >
                        {rule.period}
                      </Badge>
                      {rule.provider ? (
                        <Badge
                          variant="outline"
                          className={`h-5 px-1.5 py-0 text-[10px] ${providerColors[rule.provider] ?? ""}`}
                        >
                          {providerLabel[rule.provider] ?? rule.provider}
                        </Badge>
                      ) : (
                        <span className="text-xs text-zinc-400">All providers</span>
                      )}
                      <span className="font-mono text-xs font-semibold text-zinc-900">
                        ${Number(rule.limitUsd).toFixed(2)} limit
                      </span>
                      <span className="text-xs text-zinc-400">alert at {rule.alertAtPct}%</span>
                    </div>
                    <DeleteRuleButton id={rule.id} />
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>

        {/* Triggered alerts */}
        <Card className="rounded-xl border-zinc-100 bg-white shadow-none">
          <CardHeader className="px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-zinc-900">Recent alerts</p>
              {unackCount > 0 && (
                <span className="flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-semibold text-white">
                  {unackCount}
                </span>
              )}
            </div>
          </CardHeader>
          {alerts.length === 0 ? (
            <CardContent className="px-5 pb-5">
              <div className="flex items-center gap-2 text-zinc-400">
                <Bell className="h-4 w-4" strokeWidth={1.5} />
                <p className="text-xs">No alerts triggered yet.</p>
              </div>
            </CardContent>
          ) : (
            <CardContent className="px-0 pb-0">
              <div className="divide-y divide-zinc-50">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`flex items-center justify-between px-5 py-3.5 ${!alert.acknowledgedAt ? "bg-red-50/40" : ""}`}
                  >
                    <div className="space-y-0.5">
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
                            className={`h-4 px-1.5 py-0 text-[10px] ${providerColors[alert.budgetRule.provider] ?? ""}`}
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
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  )
}
