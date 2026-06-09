"use client"

import Link from "next/link"
import { Mail, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function ConnectEmailButton() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" className="h-8 gap-1.5 text-xs" />}>
        <Mail className="h-3.5 w-3.5" strokeWidth={1.5} />
        Connect email
        <ChevronDown className="h-3 w-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem render={<Link href="/api/auth/gmail" className="cursor-pointer" />}>
          Gmail
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/api/auth/outlook" className="cursor-pointer" />}>
          Outlook
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
