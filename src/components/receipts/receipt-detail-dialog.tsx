"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FileText } from "lucide-react"
import { format } from "date-fns"

interface ReceiptDetail {
  id: string
  provider: string | null
  amountUsd: number
  billingPeriodStart: Date | null
  billingPeriodEnd: Date | null
  invoiceId: string | null
  usageType: string
  source: string
  rawContent: string | null
  parsedAt: Date | null
  createdAt: Date
}

const SOURCE_LABEL: Record<string, string> = {
  email_forward: "Email scan",
  manual_upload: "File upload",
  manual: "Manual entry",
}

export function ReceiptDetailDialog({ receipt }: { receipt: ReceiptDetail }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="View details"
        aria-label="View receipt details"
        className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors duration-200 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
      >
        <FileText className="h-3.5 w-3.5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-zinc-900">
              Receipt details
            </DialogTitle>
          </DialogHeader>
          <dl className="mt-1 space-y-2.5 text-sm">
            <Row label="Amount" value={`$${receipt.amountUsd.toFixed(2)}`} mono />
            <Row label="Provider" value={receipt.provider ?? "—"} />
            <Row label="Type" value={receipt.usageType} />
            <Row label="Source" value={SOURCE_LABEL[receipt.source] ?? receipt.source} />
            <Row label="Invoice" value={receipt.invoiceId ?? "—"} mono />
            <Row
              label="Billing period"
              value={
                receipt.billingPeriodStart && receipt.billingPeriodEnd
                  ? `${format(receipt.billingPeriodStart, "MMM d, yyyy")} – ${format(receipt.billingPeriodEnd, "MMM d, yyyy")}`
                  : "—"
              }
            />
            <Row
              label="Added"
              value={format(receipt.parsedAt ?? receipt.createdAt, "MMM d, yyyy 'at' h:mm a")}
            />
          </dl>

          {receipt.rawContent && (
            <div className="mt-2">
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-400">
                Raw content
              </p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-100 bg-zinc-50 p-3 text-[11px] leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
                {receipt.rawContent}
              </pre>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-xs text-zinc-400">{label}</dt>
      <dd className={`text-xs text-zinc-700 dark:text-zinc-300 ${mono ? "font-mono" : ""} truncate`}>
        {value}
      </dd>
    </div>
  )
}
