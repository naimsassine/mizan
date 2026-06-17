"use client"

import Link from "next/link"
import { Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { IS_DEMO } from "@/lib/demo-client"

export function ConnectGmailButton() {
  if (IS_DEMO) {
    return (
      <Button size="sm" disabled className="h-8 gap-1.5 text-xs">
        <Mail className="h-3.5 w-3.5" strokeWidth={1.5} />
        Connect Gmail
      </Button>
    )
  }
  return (
    <Button size="sm" className="h-8 gap-1.5 text-xs" render={<Link href="/api/auth/gmail" />}>
      <Mail className="h-3.5 w-3.5" strokeWidth={1.5} />
      Connect Gmail
    </Button>
  )
}
