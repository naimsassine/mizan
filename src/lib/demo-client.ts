"use client"

import { toast } from "sonner"
import { IS_DEMO } from "@/lib/demo"

// Client-side companion to demo.ts. Mutating client components call blockedInDemo() at the top of
// their action handler: in demo mode it shows a friendly toast and returns true so the handler can
// bail out before hitting the (also-guarded) server action. Outside demo it's a no-op returning
// false. Pair it with `disabled={IS_DEMO || ...}` on the control so the affordance reads as inert.

export { IS_DEMO }

export function blockedInDemo(): boolean {
  if (IS_DEMO) {
    toast.info("Read-only demo", {
      description: "Connecting providers and edits are disabled in the demo.",
    })
    return true
  }
  return false
}
