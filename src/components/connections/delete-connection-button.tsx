"use client"

import { useState, useTransition } from "react"
import { Trash2, Loader2, AlertTriangle } from "lucide-react"
import { deleteConnection } from "@/app/(dashboard)/connections/actions"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

const providerLabel: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  bedrock: "AWS Bedrock",
}

export function DeleteConnectionButton({ id, provider }: { id: string; provider: string }) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleConfirm() {
    startTransition(async () => {
      await deleteConnection(id)
      setOpen(false)
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors duration-200 hover:bg-red-50 hover:text-red-500"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
              <AlertTriangle className="h-4.5 w-4.5 text-red-500" strokeWidth={1.5} />
            </div>
            <DialogTitle className="text-base font-semibold text-zinc-900">
              Remove {providerLabel[provider] ?? provider}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-500">
            This will permanently remove the connection and delete{" "}
            <span className="font-medium text-zinc-700">all synced usage data</span> for this
            provider. This can&apos;t be undone.
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={isPending}
              className="h-8 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirm}
              disabled={isPending}
              className="h-8 bg-red-600 text-xs text-white hover:bg-red-700"
            >
              {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Remove"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
