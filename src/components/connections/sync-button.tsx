"use client"

import { useState, useTransition } from "react"
import { RefreshCw, Loader2 } from "lucide-react"
import { triggerSync } from "@/app/(dashboard)/connections/actions"

export function SyncButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition()
  const [done, setDone] = useState(false)

  function handleClick() {
    setDone(false)
    startTransition(async () => {
      await triggerSync(id)
      setDone(true)
      setTimeout(() => setDone(false), 3000)
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
        <RefreshCw className={`h-3.5 w-3.5 ${done ? "text-emerald-500" : ""}`} />
      )}
    </button>
  )
}
