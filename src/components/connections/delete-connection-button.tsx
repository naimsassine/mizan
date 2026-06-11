"use client"

import { useState, useTransition } from "react"
import { Trash2, Loader2, AlertTriangle } from "lucide-react"
import { deleteConnection } from "@/app/(dashboard)/connections/actions"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

const providerLabel: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  bedrock: "AWS Bedrock",
  groq: "Groq",
  mistral: "Mistral AI",
  grok: "xAI / Grok",
  kimi: "Kimi",
  openrouter: "OpenRouter",
  litellm: "LiteLLM",
}

export function DeleteConnectionButton({ id, provider }: { id: string; provider: string }) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const label = providerLabel[provider] ?? provider

  function handleConfirm() {
    setOpen(false)

    let cancelled = false
    const tid = window.setTimeout(() => {
      if (!cancelled) {
        startTransition(async () => {
          await deleteConnection(id)
          router.refresh()
        })
      }
    }, 5000)

    toast(`Removing ${label}`, {
      description: "All synced usage data will be deleted.",
      action: {
        label: "Undo",
        onClick: () => {
          cancelled = true
          clearTimeout(tid)
          toast.success("Deletion cancelled", { duration: 2000 })
        },
      },
      duration: 5000,
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Remove connection"
        aria-label={`Remove ${label} connection`}
        className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors duration-200 hover:bg-red-50 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
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
              Remove {label}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-500">
            This will remove the connection and delete{" "}
            <span className="font-medium text-zinc-700">all synced usage data</span>. You&apos;ll
            have 5 seconds to undo.
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
