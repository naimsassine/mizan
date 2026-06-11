import { auth } from "@clerk/nextjs/server"
import { subDays, startOfDay, format } from "date-fns"
import { prisma } from "@/lib/prisma"
import { AddConnectionDialog } from "@/components/connections/add-connection-dialog"
import { DeleteConnectionButton } from "@/components/connections/delete-connection-button"
import { SyncButton } from "@/components/connections/sync-button"
import { SetGcpProjectButton } from "@/components/connections/set-gcp-project-button"
import { ConnectionSparkline } from "@/components/connections/connection-sparkline"
import { SyncPoller } from "@/components/connections/sync-poller"
import { ProviderIcon } from "@/components/provider-icon"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatDistanceToNow } from "date-fns"
import { AlertCircle, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

const providerLabel: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini / Vertex AI",
  bedrock: "AWS Bedrock",
  groq: "Groq",
  mistral: "Mistral AI",
  grok: "xAI / Grok",
  kimi: "Kimi (Moonshot)",
  openrouter: "OpenRouter",
  litellm: "LiteLLM",
}

const providerAccent: Record<string, string> = {
  openai: "border-l-emerald-400",
  anthropic: "border-l-orange-400",
  gemini: "border-l-blue-400",
  bedrock: "border-l-yellow-400",
  groq: "border-l-red-400",
  mistral: "border-l-purple-400",
  grok: "border-l-slate-400",
  kimi: "border-l-indigo-400",
  openrouter: "border-l-rose-400",
  litellm: "border-l-lime-400",
}

const statusVariant: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-100",
  error: "bg-red-50 text-red-700 border-red-100",
  expired: "bg-zinc-100 text-zinc-500 border-zinc-200",
}

const errorHint: Record<string, string> = {
  openai: "Check that your API key is valid and has the Usage read permission.",
  anthropic: "Check that your API key is valid and has usage data access.",
  gemini: "Re-authenticate with Google to refresh your OAuth token.",
  bedrock: "Check that your IAM credentials have Cost Explorer read access.",
  groq: "Check that your API key is valid.",
  mistral: "Check that your API key is valid.",
  grok: "Check that your xAI API key is valid.",
  kimi: "Check that your Moonshot API key is valid.",
  openrouter: "Check that your OpenRouter API key is valid.",
  litellm: "Check your LiteLLM proxy URL and API key.",
}

function computeTrend(data: number[]): { pct: number; direction: "up" | "down" | "flat" } {
  const first = (data[0] + data[1] + data[2]) / 3
  const last = (data[4] + data[5] + data[6]) / 3
  if (first === 0 && last === 0) return { pct: 0, direction: "flat" }
  if (first === 0) return { pct: 100, direction: "up" }
  const pct = ((last - first) / first) * 100
  const direction = pct > 10 ? "up" : pct < -10 ? "down" : "flat"
  return { pct: Math.abs(pct), direction }
}

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; gcp_conn?: string }>
}) {
  const { userId, orgId } = await auth()
  const ownerId = orgId ?? userId!
  const { error, gcp_conn } = await searchParams

  const sevenDaysAgo = subDays(startOfDay(new Date()), 7)

  // Build last-7-days date keys oldest → newest
  const dayKeys = Array.from({ length: 7 }, (_, i) =>
    format(subDays(startOfDay(new Date()), 6 - i), "yyyy-MM-dd"),
  )

  const [connections, sparklineRecords] = await Promise.all([
    prisma.providerConnection.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        provider: true,
        status: true,
        lastSyncedAt: true,
        backfillStatus: true,
        gcpProjectId: true,
        createdAt: true,
      },
    }),
    prisma.usageRecord.groupBy({
      by: ["connectionId", "date"],
      where: { ownerId, date: { gte: sevenDaysAgo } },
      _sum: { costUsd: true },
      orderBy: [{ date: "asc" }],
    }),
  ])

  // Build sparkline map: connectionId → Map<dateKey, cost>
  const rawMap = new Map<string, Map<string, number>>()
  for (const r of sparklineRecords) {
    const key = format(r.date, "yyyy-MM-dd")
    if (!rawMap.has(r.connectionId)) rawMap.set(r.connectionId, new Map())
    rawMap.get(r.connectionId)!.set(key, Number(r._sum.costUsd ?? 0))
  }

  function getSparklineData(connId: string) {
    const dayMap = rawMap.get(connId) ?? new Map<string, number>()
    return dayKeys.map((d) => dayMap.get(d) ?? 0)
  }

  const syncingIds = connections
    .filter((c) => c.backfillStatus === "pending" || c.backfillStatus === "in_progress")
    .map((c) => c.id)

  // Stalled: in_progress for > 10 min with no data yet (after() hit serverless limit)
  const STALL_MS = 10 * 60 * 1000
  const stalledIds = new Set(
    connections
      .filter(
        (c) =>
          (c.backfillStatus === "in_progress") &&
          !c.lastSyncedAt &&
          Date.now() - c.createdAt.getTime() > STALL_MS,
      )
      .map((c) => c.id),
  )

  return (
    <div className="mx-auto max-w-3xl px-4 md:px-8 py-6 md:py-8">
      {/* SyncPoller: auto-refreshes while any connection is syncing */}
      <SyncPoller syncingIds={syncingIds} />

      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Connections</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Connect your AI providers to start tracking usage.
          </p>
        </div>
        <AddConnectionDialog />
      </div>

      {/* Syncing banner */}
      {syncingIds.length > 0 && (
        <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-zinc-100 bg-white px-4 py-2.5">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-zinc-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-zinc-500" />
          </span>
          <span className="text-xs text-zinc-500">
            {syncingIds.length === 1 ? "1 connection" : `${syncingIds.length} connections`}{" "}
            syncing — fetching historical data
            <span className="ml-1.5 text-zinc-400">(auto-refreshing)</span>
          </span>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error === "oauth_denied" && "Google access was denied. Please try again."}
          {error === "connection_failed" && "Failed to connect. Please try again."}
          {!["oauth_denied", "connection_failed"].includes(error) &&
            "Something went wrong. Please try again."}
        </div>
      )}

      {gcp_conn && (
        <div className="mb-6 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Google Cloud connected. You have multiple GCP projects — set the project ID below to
          start syncing Vertex AI usage.
        </div>
      )}

      {connections.length === 0 ? (
        <Card className="rounded-xl border-zinc-100 bg-white shadow-none">
          <CardContent className="py-16 text-center">
            <p className="text-sm text-zinc-500">
              No connections yet.{" "}
              <span className="text-zinc-400">Add your first provider above.</span>
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {connections.map((conn) => {
            const needsGcpProject = conn.provider === "gemini" && conn.gcpProjectId === "PENDING"
            const isError = conn.status === "error"
            const isStalled = stalledIds.has(conn.id)
            const isSyncing =
              (conn.backfillStatus === "pending" || conn.backfillStatus === "in_progress") &&
              !conn.lastSyncedAt &&
              !isStalled

            const sparkData = getSparklineData(conn.id)
            const total7d = sparkData.reduce((a, b) => a + b, 0)
            const { pct, direction } = computeTrend(sparkData)
            const has7dData = total7d > 0

            const isActiveNoData =
              conn.status === "active" &&
              !isSyncing &&
              !isStalled &&
              !!conn.lastSyncedAt &&
              !has7dData

            return (
              <Card
                key={conn.id}
                className={cn(
                  "rounded-xl border-zinc-100 bg-white shadow-none border-l-2 transition-shadow duration-200 hover:shadow-sm",
                  isError
                    ? "border-l-red-400"
                    : providerAccent[conn.provider] ?? "border-l-zinc-200",
                )}
              >
                <CardContent className="px-5 py-4">
                  <div className="flex items-center justify-between gap-4">
                    {/* Left: provider icon + name + sync status */}
                    <div className="flex min-w-0 items-center gap-3">
                      <ProviderIcon provider={conn.provider} />
                      <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-900">
                        {providerLabel[conn.provider] ?? conn.provider}
                      </p>
                      {needsGcpProject ? (
                        <p className="mt-0.5 text-xs text-zinc-400">
                          Project ID required to start syncing
                        </p>
                      ) : isStalled ? (
                        <p className="mt-0.5 text-xs text-amber-600">
                          Sync may have stalled — click Sync to retry
                        </p>
                      ) : isSyncing ? (
                        <span className="mt-0.5 flex items-center gap-1.5">
                          <span className="flex gap-0.5">
                            <span className="h-1 w-1 rounded-full bg-zinc-400 animate-bounce [animation-delay:0ms]" />
                            <span className="h-1 w-1 rounded-full bg-zinc-400 animate-bounce [animation-delay:150ms]" />
                            <span className="h-1 w-1 rounded-full bg-zinc-400 animate-bounce [animation-delay:300ms]" />
                          </span>
                          <span className="text-xs text-zinc-400">Initial sync in progress…</span>
                        </span>
                      ) : (
                        <p className="mt-0.5 text-xs text-zinc-400">
                          {conn.lastSyncedAt
                            ? `Synced ${formatDistanceToNow(conn.lastSyncedAt, { addSuffix: true })}`
                            : "Never synced"}
                        </p>
                      )}
                      </div>
                    </div>

                    {/* Center: sparkline + 7d spend + trend — hidden on mobile */}
                    {!isSyncing && !needsGcpProject && (
                      <div className="hidden sm:flex items-center gap-3">
                        <ConnectionSparkline data={sparkData} />
                        <div className="text-right">
                          <p className="font-mono text-xs font-semibold tabular-nums text-zinc-900">
                            {has7dData ? `$${total7d.toFixed(2)}` : "—"}
                          </p>
                          <div className="mt-0.5 flex items-center justify-end gap-0.5">
                            {has7dData && direction === "up" && (
                              <>
                                <TrendingUp className="h-2.5 w-2.5 text-orange-400" strokeWidth={2} />
                                <span className="text-[10px] text-orange-500">+{pct.toFixed(0)}%</span>
                              </>
                            )}
                            {has7dData && direction === "down" && (
                              <>
                                <TrendingDown className="h-2.5 w-2.5 text-emerald-500" strokeWidth={2} />
                                <span className="text-[10px] text-emerald-600">-{pct.toFixed(0)}%</span>
                              </>
                            )}
                            {(!has7dData || direction === "flat") && (
                              <span className="text-[10px] text-zinc-300">7d</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Right: badge + action buttons */}
                    <div className="flex items-center gap-2 shrink-0">
                      {needsGcpProject ? (
                        <>
                          <Badge
                            variant="outline"
                            className="text-[10px] px-2 py-0 h-5 bg-amber-50 text-amber-700 border-amber-100"
                          >
                            setup needed
                          </Badge>
                          <SetGcpProjectButton connectionId={conn.id} />
                        </>
                      ) : (
                        <>
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-2 py-0 h-5 ${statusVariant[conn.status] ?? ""}`}
                          >
                            {conn.status}
                          </Badge>
                          <SyncButton id={conn.id} />
                        </>
                      )}
                      <DeleteConnectionButton id={conn.id} provider={conn.provider} />
                    </div>
                  </div>

                  {/* Inline error hint */}
                  {isError && (
                    <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-700">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                      <span>
                        {errorHint[conn.provider] ?? "Check your credentials and try re-syncing."}{" "}
                        Use the sync button to retry, or delete and re-add this connection.
                      </span>
                    </div>
                  )}

                  {/* No-data hint: synced successfully but returned zero records */}
                  {isActiveNoData && (
                    <div className="mt-3 flex items-start gap-2 rounded-lg bg-zinc-50 px-3 py-2.5 text-xs text-zinc-500">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                      <span>
                        No usage data found in the last 7 days. Check that your API key has billing
                        read access, or that there is recent usage on this account.
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
