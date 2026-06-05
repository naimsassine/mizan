import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"
import { AddConnectionDialog } from "@/components/connections/add-connection-dialog"
import { DeleteConnectionButton } from "@/components/connections/delete-connection-button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatDistanceToNow } from "date-fns"
import { cn } from "@/lib/utils"

const providerLabel: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  bedrock: "AWS Bedrock",
}

const providerAccent: Record<string, string> = {
  openai: "border-l-emerald-400",
  anthropic: "border-l-orange-400",
  gemini: "border-l-blue-400",
  bedrock: "border-l-yellow-400",
}

const statusVariant: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-100",
  error: "bg-red-50 text-red-700 border-red-100",
  expired: "bg-zinc-100 text-zinc-500 border-zinc-200",
}

export default async function ConnectionsPage() {
  const { userId, orgId } = await auth()
  const ownerId = orgId ?? userId!

  const connections = await prisma.providerConnection.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      provider: true,
      status: true,
      lastSyncedAt: true,
      backfillStatus: true,
      createdAt: true,
    },
  })

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Connections</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Connect your AI providers to start tracking usage.
          </p>
        </div>
        <AddConnectionDialog />
      </div>

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
          {connections.map((conn: typeof connections[number]) => (
            <Card
              key={conn.id}
              className={cn(
                "rounded-xl border-zinc-100 bg-white shadow-none border-l-2 transition-shadow duration-200 hover:shadow-sm",
                providerAccent[conn.provider] ?? "border-l-zinc-200"
              )}
            >
              <CardContent className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">
                      {providerLabel[conn.provider] ?? conn.provider}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-400">
                      {conn.lastSyncedAt
                        ? `Synced ${formatDistanceToNow(conn.lastSyncedAt, { addSuffix: true })}`
                        : conn.backfillStatus === "pending"
                          ? "Sync pending..."
                          : "Never synced"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-2 py-0 h-5 ${statusVariant[conn.status] ?? ""}`}
                  >
                    {conn.status}
                  </Badge>
                  <DeleteConnectionButton id={conn.id} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
