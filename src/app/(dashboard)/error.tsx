"use client"

import { useEffect } from "react"
import { AlertTriangle, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
        <AlertTriangle className="h-5 w-5 text-red-500" strokeWidth={1.5} />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-zinc-900">Something went wrong</p>
        <p className="mt-1 text-xs text-zinc-500">
          {error.digest
            ? `An error occurred while loading this page (${error.digest}).`
            : "An unexpected error occurred while loading this page."}
        </p>
      </div>
      <Button
        size="sm"
        onClick={reset}
        className="h-8 gap-1.5 bg-zinc-900 text-xs text-white hover:bg-zinc-700"
      >
        <RotateCcw className="h-3 w-3" />
        Try again
      </Button>
    </div>
  )
}
