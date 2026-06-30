"use client"

import { useTransition } from "react"
import { Trash2, Loader2 } from "lucide-react"
import { deleteReceipt } from "@/app/(dashboard)/receipts/actions"
import { blockedInDemo, IS_DEMO } from "@/lib/demo-client"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

// Direct-access delete for a receipt row (sits next to the view/edit buttons). Uses the same
// 5-second toast-undo pattern as the edit dialog's Delete so an accidental click is recoverable.
export function ReceiptDeleteButton({ id }: { id: string }) {
  const router = useRouter()
  const [isDeleting, startDelete] = useTransition()

  function handleDelete() {
    if (blockedInDemo()) return
    let cancelled = false
    const tid = window.setTimeout(() => {
      if (!cancelled) {
        startDelete(async () => {
          await deleteReceipt(id)
          router.refresh()
        })
      }
    }, 5000)
    toast("Receipt removed", {
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
    <button
      type="button"
      onClick={handleDelete}
      disabled={isDeleting || IS_DEMO}
      title="Delete"
      aria-label="Delete receipt"
      className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-300 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10"
    >
      {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  )
}
