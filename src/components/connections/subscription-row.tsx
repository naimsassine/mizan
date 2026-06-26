"use client"

import { useState, useTransition } from "react"
import { format } from "date-fns"
import { Loader2, Pencil, Ban, Trash2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ProviderIcon } from "@/components/provider-icon"
import { SubscriptionFormDialog } from "@/components/connections/subscription-form-dialog"
import { cancelSubscription, deleteSubscription } from "@/app/(dashboard)/connections/actions"
import { blockedInDemo, IS_DEMO } from "@/lib/demo-client"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

export interface SubscriptionRowData {
  id: string
  name: string
  provider: string | null
  amountUsd: number
  period: "monthly" | "yearly"
  status: "active" | "cancelled"
  startDate: string // ISO
  endDate: string | null // ISO
}

export function SubscriptionRow({ sub }: { sub: SubscriptionRowData }) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [isCancelling, startCancel] = useTransition()
  const [isDeleting, startDelete] = useTransition()

  const isActive = sub.status === "active"
  const perLabel = sub.period === "yearly" ? "yr" : "mo"

  function handleCancel() {
    if (blockedInDemo()) return
    startCancel(async () => {
      const res = await cancelSubscription(sub.id)
      if (res?.error) toast.error(res.error)
      else { toast.success("Subscription cancelled"); router.refresh() }
    })
  }

  function handleDelete() {
    if (blockedInDemo()) return
    let cancelled = false
    const tid = window.setTimeout(() => {
      if (!cancelled) {
        startDelete(async () => {
          await deleteSubscription(sub.id)
          router.refresh()
        })
      }
    }, 5000)
    toast("Subscription removed", {
      action: {
        label: "Undo",
        onClick: () => {
          cancelled = true
          clearTimeout(tid)
          toast.success("Deletion cancelled", { duration: 2000 })
        },
      },
      duration: 5000,
    })
  }

  return (
    <Card
      className={`rounded-xl border-zinc-100 bg-white shadow-none border-l-2 transition-shadow duration-200 hover:shadow-sm ${
        isActive ? "border-l-zinc-300" : "border-l-zinc-100"
      }`}
    >
      <CardContent className="px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {sub.provider ? (
              <ProviderIcon provider={sub.provider} />
            ) : (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-[10px] font-semibold text-zinc-400">
                {sub.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-zinc-900">{sub.name}</p>
              <p className="mt-0.5 text-xs text-zinc-400">
                {isActive
                  ? `since ${format(new Date(sub.startDate), "MMM d, yyyy")}`
                  : sub.endDate
                    ? `ended ${format(new Date(sub.endDate), "MMM d, yyyy")}`
                    : "cancelled"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <p className="font-mono text-xs font-semibold tabular-nums text-zinc-900">
                ${sub.amountUsd.toFixed(2)}
                <span className="text-zinc-400">/{perLabel}</span>
              </p>
              <Badge
                variant="outline"
                className={`mt-0.5 h-4 px-1.5 py-0 text-[10px] capitalize ${
                  isActive
                    ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                    : "bg-zinc-100 text-zinc-500 border-zinc-200"
                }`}
              >
                {sub.status}
              </Badge>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => { if (!blockedInDemo()) setEditOpen(true) }}
                disabled={IS_DEMO}
                title="Edit"
                className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-300 transition-colors hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-50"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              {isActive && (
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={isCancelling || IS_DEMO}
                  title="Cancel subscription"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-300 transition-colors hover:bg-amber-50 hover:text-amber-600 disabled:opacity-50"
                >
                  {isCancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                </button>
              )}
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting || IS_DEMO}
                title="Delete"
                className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-300 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </CardContent>

      {/* Controlled edit dialog */}
      <SubscriptionFormDialog
        subscription={{
          id: sub.id,
          name: sub.name,
          provider: sub.provider,
          amountUsd: sub.amountUsd,
          period: sub.period,
          startDate: new Date(sub.startDate),
        }}
        open={editOpen}
        onOpenChange={setEditOpen}
        hideTrigger
      />
    </Card>
  )
}
