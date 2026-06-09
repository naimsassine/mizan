"use client"

import { useTransition } from "react"
import { Trash2, Loader2 } from "lucide-react"
import { deleteBudgetRule } from "@/app/(dashboard)/notifications/actions"
import { useRouter } from "next/navigation"

export function DeleteRuleButton({ id }: { id: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      await deleteBudgetRule(id)
      router.refresh()
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors duration-200 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
    >
      {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  )
}
