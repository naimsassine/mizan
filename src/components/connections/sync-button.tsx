"use client"

import { useTransition } from "react"
import { RefreshCw, Loader2 } from "lucide-react"
import { triggerSync } from "@/app/(dashboard)/connections/actions"
import { toast } from "sonner"

export function SyncButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      try {
        await triggerSync(id)
        toast.success("Sync complete", { description: "Usage data is up to date." })
      } catch {
        toast.error("Sync failed", { description: "Check your connection credentials." })
      }
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      title="Sync now"
      className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors duration-200 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50"
    >
      {isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" />
      )}
    </button>
  )
}
