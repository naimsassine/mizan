import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"
import { AddConnectionDialog } from "@/components/connections/add-connection-dialog"
import { DeleteConnectionButton } from "@/components/connections/delete-connection-button"
import { SyncButton } from "@/components/connections/sync-button"
import { SetGcpProjectButton } from "@/components/connections/set-gcp-project-button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatDistanceToNow } from "date-fns"
import { AlertCircle } from "lucide-react"
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

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; gcp_conn?: string }>
}) {
  const { userId, orgId } = await auth()
  const ownerId = orgId ?? userId!
  const { error, gcp_conn } = await searchParams

  const connections = await prisma.providerConnection.findMany({
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
  })

  return (
    <div className="mx-auto max-w-3xl px-4 md:px-8 py-6 md:py-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Connections</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Connect your AI providers to start tracking usage.
          </p>
        </div>
        <AddConnectionDialog />
      </div>

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
            const needsGcpProject =
              conn.provider === "gemini" && conn.gcpProjectId === "PENDING"
            const isError = conn.status === "error"

            return (
              <Card
                key={conn.id}
                className={cn(
                  "rounded-xl border-zinc-100 bg-white shadow-none border-l-2 transition-shadow duration-200 hover:shadow-sm",
                  isError ? "border-l-red-400" : (providerAccent[conn.provider] ?? "border-l-zinc-200"),
                )}
              >
                <CardContent className="px-5 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-sm font-medium text-zinc-900">
                          {providerLabel[conn.provider] ?? conn.provider}
                        </p>
                        {needsGcpProject ? (
                          <p className="mt-0.5 text-xs text-zinc-400">Project ID required to start syncing</p>
                        ) : (conn.backfillStatus === "pending" || conn.backfillStatus === "in_progress") && !conn.lastSyncedAt ? (
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
                    <div className="flex items-center gap-2">
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
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
