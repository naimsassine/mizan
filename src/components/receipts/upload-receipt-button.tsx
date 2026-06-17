"use client"

import { useRef, useState, useTransition } from "react"
import { Upload, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { uploadReceipt } from "@/app/(dashboard)/receipts/actions"
import { blockedInDemo, IS_DEMO } from "@/lib/demo-client"

export function UploadReceiptButton() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [uploadError, setUploadError] = useState<string | null>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (blockedInDemo()) return
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)

    const formData = new FormData()
    formData.append("file", file)

    startTransition(async () => {
      const result = await uploadReceipt(formData)
      if (result?.error) setUploadError(result.error)
      if (inputRef.current) inputRef.current.value = ""
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={handleChange}
      />
      <Button
        size="sm"
        variant="outline"
        onClick={() => { if (blockedInDemo()) return; setUploadError(null); inputRef.current?.click() }}
        disabled={isPending || IS_DEMO}
        className="h-8 gap-1.5 text-xs"
      >
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Upload className="h-3.5 w-3.5" strokeWidth={1.5} />
        )}
        {isPending ? "Parsing…" : "Upload"}
      </Button>
      {uploadError && (
        <p className="text-[11px] text-red-500 max-w-[200px] text-right">{uploadError}</p>
      )}
    </div>
  )
}
