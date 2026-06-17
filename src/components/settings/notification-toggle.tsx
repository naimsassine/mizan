"use client"

import { useState, useTransition } from "react"
import { saveNotificationEmail } from "@/app/(dashboard)/settings/actions"
import { Loader2 } from "lucide-react"
import { blockedInDemo, IS_DEMO } from "@/lib/demo-client"
import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"

interface Props {
  defaultEnabled: boolean
  ownerId: string
}

export function NotificationToggle({ defaultEnabled, ownerId }: Props) {
  const [enabled, setEnabled] = useState(defaultEnabled)
  const [isPending, startTransition] = useTransition()

  function handleToggle() {
    if (blockedInDemo()) return
    const next = !enabled
    setEnabled(next)
    startTransition(async () => {
      await saveNotificationEmail(ownerId, next)
    })
  }

  return (
    <div className="flex items-center gap-4">
      <Label className="text-xs text-zinc-600">Email notifications for budget alerts</Label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={handleToggle}
          disabled={isPending || IS_DEMO}
          className={cn(
            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            enabled ? "bg-zinc-900" : "bg-zinc-200"
          )}
        >
          <span
            className={cn(
              "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
              enabled ? "translate-x-4" : "translate-x-0"
            )}
          />
        </button>
        {isPending && <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />}
      </div>
    </div>
  )
}
