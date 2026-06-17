"use client"

import { useState, useTransition } from "react"
import { RefreshCw, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { triggerEmailScan } from "@/app/(dashboard)/receipts/actions"
import { blockedInDemo, IS_DEMO } from "@/lib/demo-client"

type State = "idle" | "pending" | "queued"

export function ScanEmailButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition()
  const [state, setState] = useState<State>("idle")
  const router = useRouter()

  function handleClick() {
    if (blockedInDemo()) return
    setState("pending")
    startTransition(async () => {
      await triggerEmailScan(id)
      setState("queued")
      // Refresh page data, then after a delay reset the button
      router.refresh()
      setTimeout(() => setState("idle"), 5000)
    })
  }

  if (state === "queued") {
    return (
      <span className="text-[10px] text-zinc-400 italic">scanning…</span>
    )
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending || IS_DEMO}
      title="Scan inbox now"
      aria-label="Scan inbox now"
      className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors duration-200 hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:opacity-50 dark:hover:bg-zinc-800"
    >
      {isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" />
      )}
    </button>
  )
}
