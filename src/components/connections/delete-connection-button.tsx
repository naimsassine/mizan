"use client"

import { useTransition } from "react"
import { Trash2, Loader2 } from "lucide-react"
import { deleteConnection } from "@/app/(dashboard)/connections/actions"

export function DeleteConnectionButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition()

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          await deleteConnection(id)
        })
      }
      disabled={isPending}
      className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
    >
      {isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Trash2 className="h-3.5 w-3.5" />
      )}
    </button>
  )
}
