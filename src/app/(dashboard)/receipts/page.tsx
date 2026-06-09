import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Mail, Receipt } from "lucide-react"
import { formatDistanceToNow, format } from "date-fns"
import { ConnectEmailButton } from "@/components/receipts/connect-email-button"
import { ScanEmailButton } from "@/components/receipts/scan-email-button"
import { DisconnectEmailButton } from "@/components/receipts/disconnect-email-button"

const providerColors: Record<string, string> = {
  openai: "bg-emerald-50 text-emerald-700 border-emerald-100",
  anthropic: "bg-orange-50 text-orange-700 border-orange-100",
  google: "bg-blue-50 text-blue-700 border-blue-100",
  aws: "bg-yellow-50 text-yellow-700 border-yellow-100",
  mistral: "bg-purple-50 text-purple-700 border-purple-100",
  cohere: "bg-teal-50 text-teal-700 border-teal-100",
  perplexity: "bg-cyan-50 text-cyan-700 border-cyan-100",
  cursor: "bg-pink-50 text-pink-700 border-pink-100",
}

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { userId, orgId } = await auth()
  const ownerId = orgId ?? userId!
  const { error } = await searchParams

  const [emailConnections, receipts] = await Promise.all([
    prisma.emailConnection.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.receipt.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ])

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Receipts</h1>
          <p className="mt-1 text-sm text-zinc-500">
            AI billing receipts found automatically in your email.
          </p>
        </div>
        <ConnectEmailButton />
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error === "oauth_denied" && "Gmail access was denied. Please try again."}
          {error === "state_mismatch" && "Security check failed. Please try connecting again."}
          {error === "connection_failed" && "Failed to connect Gmail. Please try again."}
          {!["oauth_denied", "state_mismatch", "connection_failed"].includes(error) &&
            "Something went wrong. Please try again."}
        </div>
      )}

      {/* Connected email accounts */}
      {emailConnections.length > 0 && (
        <div className="mb-6 space-y-2">
          {emailConnections.map((conn) => (
            <Card
              key={conn.id}
              className="rounded-xl border-zinc-100 bg-white shadow-none border-l-2 border-l-violet-400"
            >
              <CardContent className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-zinc-400" strokeWidth={1.5} />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-zinc-900">{conn.emailAddress}</p>
                      <span className="text-[10px] text-zinc-400 capitalize">{conn.emailProvider}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-400">
                      {conn.lastScannedAt ? (
                        <>
                          Scanned {formatDistanceToNow(conn.lastScannedAt, { addSuffix: true })}
                          {conn.lastScanFound !== null && (
                            <> · {conn.lastScanFound === 0
                              ? "no new receipts"
                              : `${conn.lastScanFound} receipt${conn.lastScanFound !== 1 ? "s" : ""} found`}
                            </>
                          )}
                        </>
                      ) : (
                        "Scan in progress…"
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-2 py-0 h-5 ${
                      conn.status === "active"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                        : "bg-red-50 text-red-700 border-red-100"
                    }`}
                  >
                    {conn.status}
                  </Badge>
                  <ScanEmailButton id={conn.id} />
                  <DisconnectEmailButton id={conn.id} email={conn.emailAddress} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Receipts */}
      <Card className="rounded-xl border-zinc-100 bg-white shadow-none">
        <CardHeader className="px-5 pt-5 pb-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-900">Parsed receipts</p>
            {receipts.length > 0 && (
              <span className="text-xs text-zinc-400">{receipts.length} found</span>
            )}
          </div>
        </CardHeader>
        {receipts.length === 0 ? (
          <CardContent className="py-16 text-center">
            <div className="flex flex-col items-center gap-3">
              <Receipt className="h-8 w-8 text-zinc-200" strokeWidth={1} />
              <p className="max-w-xs text-sm text-zinc-400">
                {emailConnections.length === 0
                  ? "Connect your Gmail account to automatically find AI billing emails."
                  : "No AI billing receipts found yet. Results will appear after your inbox is scanned."}
              </p>
            </div>
          </CardContent>
        ) : (
          <CardContent className="px-0 pb-0">
            <div className="divide-y divide-zinc-50">
              {receipts.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-5 py-3.5">
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {r.provider && (
                        <Badge
                          variant="outline"
                          className={`h-5 px-1.5 py-0 text-[10px] capitalize ${
                            providerColors[r.provider] ?? "bg-zinc-50 text-zinc-600 border-zinc-200"
                          }`}
                        >
                          {r.provider}
                        </Badge>
                      )}
                      <span className="font-mono text-xs font-semibold text-zinc-900">
                        ${Number(r.amountUsd).toFixed(2)}
                      </span>
                      {r.invoiceId && (
                        <span className="text-xs text-zinc-400">{r.invoiceId}</span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      {r.billingPeriodStart && r.billingPeriodEnd
                        ? `${format(r.billingPeriodStart, "MMM d")} – ${format(r.billingPeriodEnd, "MMM d, yyyy")}`
                        : r.parsedAt
                          ? `Parsed ${formatDistanceToNow(r.parsedAt, { addSuffix: true })}`
                          : formatDistanceToNow(r.createdAt, { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
