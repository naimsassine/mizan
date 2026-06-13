import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Mail, Receipt } from "lucide-react"
import { formatDistanceToNow, format } from "date-fns"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { ConnectEmailButton } from "@/components/receipts/connect-email-button"
import { ScanEmailButton } from "@/components/receipts/scan-email-button"
import { DisconnectEmailButton } from "@/components/receipts/disconnect-email-button"
import { ReceiptFormDialog } from "@/components/receipts/receipt-form-dialog"
import { UploadReceiptButton } from "@/components/receipts/upload-receipt-button"
import { ReclassifyBadge } from "@/components/receipts/reclassify-badge"
import { ReceiptDetailDialog } from "@/components/receipts/receipt-detail-dialog"

const PAGE_SIZE = 25

const providerColors: Record<string, string> = {
  openai: "bg-emerald-50 text-emerald-700 border-emerald-100",
  anthropic: "bg-orange-50 text-orange-700 border-orange-100",
  google: "bg-blue-50 text-blue-700 border-blue-100",
  aws: "bg-yellow-50 text-yellow-700 border-yellow-100",
  mistral: "bg-purple-50 text-purple-700 border-purple-100",
  cohere: "bg-teal-50 text-teal-700 border-teal-100",
  perplexity: "bg-cyan-50 text-cyan-700 border-cyan-100",
  cursor: "bg-pink-50 text-pink-700 border-pink-100",
  groq: "bg-red-50 text-red-700 border-red-100",
  grok: "bg-slate-50 text-slate-700 border-slate-200",
  xai: "bg-slate-50 text-slate-700 border-slate-200",
  openrouter: "bg-rose-50 text-rose-700 border-rose-100",
  litellm: "bg-lime-50 text-lime-700 border-lime-100",
}

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; provider?: string; type?: string; page?: string }>
}) {
  const { userId, orgId } = await auth()
  const ownerId = orgId ?? userId!
  const { error, provider: providerParam, type: typeParam, page: pageParam } = await searchParams

  const typeFilter: "api" | "subscription" | null =
    typeParam === "api" || typeParam === "subscription" ? typeParam : null
  const page = Math.max(1, Number(pageParam) || 1)

  // Distinct providers present (for filter chips)
  const distinctProviders = await prisma.receipt.findMany({
    where: { ownerId, provider: { not: null } },
    select: { provider: true },
    distinct: ["provider"],
    orderBy: { provider: "asc" },
  })
  const availableProviders = distinctProviders.map((r) => r.provider!).filter(Boolean)
  const providerFilter = providerParam && availableProviders.includes(providerParam) ? providerParam : null

  const receiptWhere = {
    ownerId,
    ...(providerFilter ? { provider: providerFilter } : {}),
    ...(typeFilter ? { usageType: typeFilter } : {}),
  }

  const [emailConnections, receipts, totalReceipts] = await Promise.all([
    prisma.emailConnection.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.receipt.findMany({
      where: receiptWhere,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.receipt.count({ where: receiptWhere }),
  ])

  const totalPages = Math.max(1, Math.ceil(totalReceipts / PAGE_SIZE))
  const hasFilters = !!providerFilter || !!typeFilter

  function filterHref(opts: { provider?: string | null; type?: string | null; page?: number }) {
    const p = new URLSearchParams()
    const prov = opts.provider === undefined ? providerFilter : opts.provider
    const typ = opts.type === undefined ? typeFilter : opts.type
    if (prov) p.set("provider", prov)
    if (typ) p.set("type", typ)
    if (opts.page && opts.page > 1) p.set("page", String(opts.page))
    const qs = p.toString()
    return qs ? `/receipts?${qs}` : "/receipts"
  }

  return (
    <div className="mx-auto max-w-3xl px-4 md:px-8 py-6 md:py-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Receipts</h1>
          <p className="mt-1 text-sm text-zinc-500">
            AI billing receipts — from email, file uploads, or entered manually.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <UploadReceiptButton />
          <ReceiptFormDialog />
          <ConnectEmailButton />
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error === "oauth_denied" && "Email access was denied. Please try again."}
          {error === "state_mismatch" && "Security check failed. Please try connecting again."}
          {error === "connection_failed" && "Failed to connect. Please try again."}
          {!["oauth_denied", "state_mismatch", "connection_failed"].includes(error) &&
            "Something went wrong. Please try again."}
        </div>
      )}

      {/* Connected email accounts */}
      {emailConnections.length > 0 && (
        <div className="mb-6">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">Connected email accounts</p>
          <div className="space-y-2">
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
                      <span className="text-[10px] text-zinc-400 capitalize">
                        {conn.emailProvider}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-400">
                      {conn.lastScannedAt ? (
                        <>
                          Scanned {formatDistanceToNow(conn.lastScannedAt, { addSuffix: true })}
                          {conn.lastScanFound !== null && (
                            <>
                              {" · "}
                              {conn.lastScanFound === 0
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
        </div>
      )}

      {/* Filters */}
      {(availableProviders.length > 0 || totalReceipts > 0) && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <Link
            href={filterHref({ provider: null, type: null, page: 1 })}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              !hasFilters
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-400 hover:text-zinc-900",
            )}
          >
            All
          </Link>
          {(["api", "subscription"] as const).map((t) => (
            <Link
              key={t}
              href={filterHref({ type: typeFilter === t ? null : t, page: 1 })}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors",
                typeFilter === t
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-400 hover:text-zinc-900",
              )}
            >
              {t}
            </Link>
          ))}
          {availableProviders.map((p) => (
            <Link
              key={p}
              href={filterHref({ provider: providerFilter === p ? null : p, page: 1 })}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors",
                providerFilter === p
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-400 hover:text-zinc-900",
              )}
            >
              {p}
            </Link>
          ))}
        </div>
      )}

      {/* Receipts */}
      <Card className="rounded-xl border-zinc-100 bg-white shadow-none">
        <CardHeader className="px-5 pt-5 pb-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-900">Receipts</p>
            {totalReceipts > 0 && (
              <span className="text-xs text-zinc-400">
                {hasFilters ? `${totalReceipts} matching` : `${totalReceipts} total`}
              </span>
            )}
          </div>
        </CardHeader>
        {receipts.length === 0 ? (
          <CardContent className="py-16 text-center">
            <div className="flex flex-col items-center gap-3">
              <Receipt className="h-8 w-8 text-zinc-200" strokeWidth={1} />
              <p className="max-w-xs text-sm text-zinc-400">
                {hasFilters
                  ? "No receipts match these filters."
                  : "No receipts yet. Connect your email, upload a PDF, or add one manually."}
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
                            providerColors[r.provider] ??
                            "bg-zinc-50 text-zinc-600 border-zinc-200"
                          }`}
                        >
                          {r.provider}
                        </Badge>
                      )}
                      <ReclassifyBadge id={r.id} usageType={r.usageType} />
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
                  <div className="flex items-center gap-1">
                    <ReceiptDetailDialog
                      receipt={{
                        id: r.id,
                        provider: r.provider,
                        amountUsd: Number(r.amountUsd),
                        billingPeriodStart: r.billingPeriodStart,
                        billingPeriodEnd: r.billingPeriodEnd,
                        invoiceId: r.invoiceId,
                        usageType: r.usageType,
                        source: r.source,
                        rawContent: r.rawContent,
                        parsedAt: r.parsedAt,
                        createdAt: r.createdAt,
                      }}
                    />
                    <ReceiptFormDialog
                      receipt={{
                        id: r.id,
                        provider: r.provider,
                        amountUsd: Number(r.amountUsd),
                        billingPeriodStart: r.billingPeriodStart,
                        billingPeriodEnd: r.billingPeriodEnd,
                        invoiceId: r.invoiceId,
                        usageType: r.usageType,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-zinc-400">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Link
                href={filterHref({ page: page - 1 })}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-900"
              >
                Previous
              </Link>
            ) : (
              <span className="rounded-lg border border-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-300">
                Previous
              </span>
            )}
            {page < totalPages ? (
              <Link
                href={filterHref({ page: page + 1 })}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-900"
              >
                Next
              </Link>
            ) : (
              <span className="rounded-lg border border-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-300">
                Next
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
