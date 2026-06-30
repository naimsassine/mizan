"use client"

import { useRef, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { Plus, ChevronDown, PenLine, Upload, Mail, Loader2 } from "lucide-react"
import { SubscriptionFormDialog } from "@/components/connections/subscription-form-dialog"
import { uploadReceipt } from "@/app/(dashboard)/receipts/actions"
import { blockedInDemo, IS_DEMO } from "@/lib/demo-client"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

export function AddSubscriptionMenu() {
  const router = useRouter()
  const [manualOpen, setManualOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [isUploading, startUpload] = useTransition()

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    if (blockedInDemo()) return
    const file = e.target.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.append("file", file)
    startUpload(async () => {
      const result = await uploadReceipt(formData)
      if (inputRef.current) inputRef.current.value = ""
      if (result?.error) toast.error(result.error)
      else { toast.success("Receipt added"); router.refresh() }
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button size="sm" disabled={IS_DEMO} className="bg-zinc-900 text-white hover:bg-zinc-700 gap-1.5" />
          }
        >
          {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add subscription
          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => { if (!blockedInDemo()) setManualOpen(true) }}>
            <PenLine className="text-zinc-500" />
            Add manually
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => { if (!blockedInDemo()) inputRef.current?.click() }}>
            <Upload className="text-zinc-500" />
            Upload receipt
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => { if (!blockedInDemo()) window.location.href = "/api/auth/gmail?scope=subscription" }}>
            <Mail className="text-zinc-500" />
            Connect email
            <span className="ml-auto text-[10px] text-zinc-400">subs only</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={handleFile}
      />

      <SubscriptionFormDialog open={manualOpen} onOpenChange={setManualOpen} hideTrigger />
    </>
  )
}
