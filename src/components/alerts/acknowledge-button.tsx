"use client"

import { useTransition } from "react"
import { CheckCheck, Loader2 } from "lucide-react"
import { acknowledgeAlert } from "@/app/(dashboard)/alerts/actions"
import { useRouter } from "next/navigation"

export function AcknowledgeButton({ id }: { id: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      await acknowledgeAlert(id)
      router.refresh()
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      title="Acknowledge"
      className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors duration-200 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50"
    >
      {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
    </button>
  )
}
