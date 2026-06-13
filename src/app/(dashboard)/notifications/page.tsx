import { auth } from "@clerk/nextjs/server"
import { subDays, startOfMonth, endOfMonth, startOfDay, format, differenceInCalendarDays } from "date-fns"
import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Bell } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { AddRuleDialog } from "@/components/notifications/add-rule-dialog"
import { DeleteRuleButton } from "@/components/notifications/delete-rule-button"
import { AcknowledgeButton } from "@/components/notifications/acknowledge-button"
import { DigestSettingsForm } from "@/components/notifications/digest-settings-form"
import { AlertHistoryList } from "@/components/notifications/alert-history-list"
import { AnomalyCard, type SpendAnomaly } from "@/components/notifications/anomaly-card"

const providerLabel: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  bedrock: "AWS Bedrock",
  groq: "Groq",
  mistral: "Mistral AI",
  grok: "xAI / Grok",
  openrouter: "OpenRouter",
  litellm: "LiteLLM",
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

const periodColors: Record<string, string> = {
  daily: "bg-violet-50 text-violet-700 border-violet-100",
  weekly: "bg-sky-50 text-sky-700 border-sky-100",
  monthly: "bg-indigo-50 text-indigo-700 border-indigo-100",
}

export default async function NotificationsPage() {
  const { userId, orgId } = await auth()
  const ownerId = orgId ?? userId!
  const isOrg = !!orgId

  const now = new Date()
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)
  const weekAgo = subDays(now, 7)
  const dayAgo = subDays(now, 1)
  const fourteenDaysAgo = subDays(startOfDay(now), 13)

  const [rules, alerts, userSettings, monthlySpend, weeklySpend, dailySpend, anomalyRecords] = await Promise.all([
    prisma.budgetRule.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.alert.findMany({
      where: { budgetRule: { ownerId } },
      orderBy: { triggeredAt: "desc" },
      take: 50,
      include: {
        budgetRule: { select: { provider: true, period: true, limitUsd: true } },
      },
    }),
    !isOrg && userId
      ? prisma.userSettings.findUnique({ where: { clerkUserId: userId } })
      : null,
    prisma.usageRecord.aggregate({
      where: { ownerId, date: { gte: monthStart, lte: monthEnd } },
      _sum: { costUsd: true },
    }),
    prisma.usageRecord.aggregate({
      where: { ownerId, date: { gte: weekAgo } },
      _sum: { costUsd: true },
    }),
    prisma.usageRecord.aggregate({
      where: { ownerId, date: { gte: dayAgo } },
      _sum: { costUsd: true },
    }),
    prisma.usageRecord.groupBy({
      by: ["date"],
      where: { ownerId, date: { gte: fourteenDaysAgo } },
      _sum: { costUsd: true },
      orderBy: [{ date: "asc" }],
    }),
  ])

  // Serialize Decimal fields for client components
  const serializedAlerts = alerts.map((a) => ({
    ...a,
    spendUsd: Number(a.spendUsd),
    budgetRule: {
      ...a.budgetRule,
      limitUsd: Number(a.budgetRule.limitUsd),
    },
  }))

  const unackCount = alerts.filter((a) => !a.acknowledgedAt).length

  const digestProviders = userSettings?.weeklyDigestProviders
    ? userSettings.weeklyDigestProviders.split(",").filter(Boolean)
    : []

  const spendSuggestions = {
    monthly: Number(monthlySpend._sum.costUsd ?? 0),
    weekly: Number(weeklySpend._sum.costUsd ?? 0),
    daily: Number(dailySpend._sum.costUsd ?? 0),
  }

  // Anomaly detection: flag days where total spend ≥ 2× previous day and ≥ $0.10
  const MIN_SPEND = 0.10
  const dailySeries = anomalyRecords.map((r) => ({
    date: r.date,
    key: format(r.date, "yyyy-MM-dd"),
    cost: Number(r._sum.costUsd ?? 0),
  }))
  const anomalies: SpendAnomaly[] = []
  for (let i = 1; i < dailySeries.length; i++) {
    const prev = dailySeries[i - 1]
    const curr = dailySeries[i]
    // Only flag adjacent calendar days — skip weekend/holiday gaps to avoid false positives
    if (differenceInCalendarDays(curr.date, prev.date) !== 1) continue
    if (curr.cost >= MIN_SPEND && prev.cost > 0 && curr.cost >= prev.cost * 2) {
      anomalies.push({
        date: curr.date,
        provider: null,
        prevCost: prev.cost,
        currCost: curr.cost,
        multiplier: curr.cost / prev.cost,
      })
    }
  }
  // Keep only the 5 most severe
  anomalies.sort((a, b) => b.multiplier - a.multiplier)
  const topAnomalies = anomalies.slice(0, 5)

  return (
    <div className="mx-auto max-w-3xl px-4 md:px-8 py-6 md:py-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Notifications</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Cost alerts and weekly email digests for your AI spend.
          </p>
        </div>
        <AddRuleDialog spendSuggestions={spendSuggestions} />
      </div>

      <div className="space-y-6">
        {/* Weekly digest — personal accounts only */}
        {!isOrg && (
          <Card className="rounded-xl border-zinc-100 bg-white shadow-none">
            <CardHeader className="px-5 pt-5 pb-2">
              <p className="text-sm font-medium text-zinc-900">Weekly digest</p>
              <p className="text-xs text-zinc-500">
                Get a weekly email with your spend summary, week-over-week trends, and top models.
              </p>
            </CardHeader>
            <Separator className="bg-zinc-50" />
            <CardContent className="px-5 py-4">
              <DigestSettingsForm
                defaultEnabled={userSettings?.weeklyDigest ?? false}
                defaultDay={userSettings?.weeklyDigestDay ?? 1}
                defaultProviders={digestProviders}
              />
            </CardContent>
          </Card>
        )}

        {/* Anomaly detection */}
        {topAnomalies.length > 0 && <AnomalyCard anomalies={topAnomalies} />}

        {/* Cost alert rules */}
        <Card className="rounded-xl border-zinc-100 bg-white shadow-none">
          <CardHeader className="px-5 pt-5 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-900">Cost alerts</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Get an email when spend crosses a threshold you set.
                </p>
              </div>
            </div>
          </CardHeader>
          {rules.length === 0 ? (
            <CardContent className="px-5 pb-5">
              <p className="text-xs text-zinc-400">
                No cost alerts yet. Use &ldquo;Add rule&rdquo; above to create one.
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
                          className={`h-5 px-1.5 py-0 text-[10px] ${providerColors[rule.provider] ?? "bg-zinc-50 text-zinc-600 border-zinc-200"}`}
                        >
                          {providerLabel[rule.provider] ?? rule.provider}
                        </Badge>
                      ) : (
                        <span className="text-xs text-zinc-400">All providers</span>
                      )}
                      <span className="font-mono text-xs font-semibold text-zinc-900">
                        ${Number(rule.limitUsd).toFixed(2)} limit
                      </span>
                      <span className="text-xs text-zinc-400">
                        alert at {rule.alertAtPct}%
                      </span>
                    </div>
                    <DeleteRuleButton id={rule.id} />
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>

        {/* Triggered alert history */}
        <Card className="rounded-xl border-zinc-100 bg-white shadow-none">
          <CardHeader className="px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-zinc-900">Alert history</p>
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
            <AlertHistoryList alerts={serializedAlerts} providerColors={providerColors} providerLabel={providerLabel} />
          )}
        </Card>
      </div>
    </div>
  )
}
