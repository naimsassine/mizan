"use client"

import { useTransition } from "react"
import { Loader2 } from "lucide-react"
import { reclassifyReceipt } from "@/app/(dashboard)/receipts/actions"
import { toast } from "sonner"
import { blockedInDemo, IS_DEMO } from "@/lib/demo-client"

interface Props {
  id: string
  usageType: "api" | "subscription"
}

export function ReclassifyBadge({ id, usageType }: Props) {
  const [isPending, startTransition] = useTransition()

  function toggle() {
    if (blockedInDemo()) return
    const next = usageType === "api" ? "subscription" : "api"
    startTransition(async () => {
      await reclassifyReceipt(id, next)
      toast.success(`Reclassified as ${next}`)
    })
  }

  return (
    <button
      onClick={toggle}
      disabled={isPending || IS_DEMO}
      title={`Click to reclassify as ${usageType === "api" ? "subscription" : "API usage"}`}
      className={`inline-flex items-center gap-1 h-5 px-1.5 rounded-md border text-[10px] font-medium transition-colors cursor-pointer
        ${usageType === "subscription"
          ? "bg-violet-50 text-violet-600 border-violet-100 hover:bg-violet-100"
          : "bg-zinc-50 text-zinc-500 border-zinc-100 hover:bg-zinc-100"
        }`}
    >
      {isPending ? (
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
      ) : (
        usageType === "subscription" ? "subscription" : "api"
      )}
    </button>
  )
}
