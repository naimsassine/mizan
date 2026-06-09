"use client"

import Link from "next/link"
import { Mail } from "lucide-react"
import { Button } from "@/components/ui/button"

export function ConnectGmailButton() {
  return (
    <Button asChild size="sm" className="h-8 gap-1.5 text-xs">
      <Link href="/api/auth/gmail">
        <Mail className="h-3.5 w-3.5" strokeWidth={1.5} />
        Connect Gmail
      </Link>
    </Button>
  )
}
