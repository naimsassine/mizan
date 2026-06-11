"use client"

import { useTransition } from "react"
import { Trash2, Loader2 } from "lucide-react"
import { deleteBudgetRule } from "@/app/(dashboard)/notifications/actions"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

export function DeleteRuleButton({ id }: { id: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      await deleteBudgetRule(id)
      toast.success("Budget rule deleted")
      router.refresh()
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      title="Delete rule"
      aria-label="Delete budget rule"
      className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors duration-200 hover:bg-red-50 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:opacity-50"
    >
      {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  )
}
