"use client"

import { useState, useTransition } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, Loader2, Trash2, Pencil } from "lucide-react"
import { createReceipt, updateReceipt, deleteReceipt } from "@/app/(dashboard)/receipts/actions"
import { format } from "date-fns"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { blockedInDemo, IS_DEMO } from "@/lib/demo-client"

const PROVIDERS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google" },
  { value: "aws", label: "AWS" },
  { value: "mistral", label: "Mistral AI" },
  { value: "grok", label: "xAI / Grok" },
  { value: "cohere", label: "Cohere" },
  { value: "perplexity", label: "Perplexity" },
  { value: "cursor", label: "Cursor" },
  { value: "together", label: "Together AI" },
  { value: "replicate", label: "Replicate" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "litellm",    label: "LiteLLM" },
  { value: "other",      label: "Other" },
]

interface ReceiptData {
  id: string
  provider: string | null
  amountUsd: number | string
  billingPeriodStart: Date | null
  billingPeriodEnd: Date | null
  invoiceId: string | null
  usageType?: "api" | "subscription" | null
}

interface Props {
  receipt?: ReceiptData
  // Controlled-open support so a parent dropdown can drive the dialog.
  open?: boolean
  onOpenChange?: (v: boolean) => void
  hideTrigger?: boolean
  // When set, the API/Subscription toggle is hidden and the type is forced.
  lockedType?: "api" | "subscription"
  title?: string
}

export function ReceiptFormDialog({ receipt, open: openProp, onOpenChange, hideTrigger, lockedType, title }: Props) {
  const isEdit = !!receipt
  const [internalOpen, setInternalOpen] = useState(false)
  const open = openProp ?? internalOpen
  const setOpen = (v: boolean) => {
    if (onOpenChange) onOpenChange(v)
    else setInternalOpen(v)
  }
  const [provider, setProvider] = useState(receipt?.provider ?? "")
  const [amount, setAmount] = useState(
    receipt ? Number(receipt.amountUsd).toFixed(2) : "",
  )
  const [periodStart, setPeriodStart] = useState(
    receipt?.billingPeriodStart ? format(receipt.billingPeriodStart, "yyyy-MM-dd") : "",
  )
  const [periodEnd, setPeriodEnd] = useState(
    receipt?.billingPeriodEnd ? format(receipt.billingPeriodEnd, "yyyy-MM-dd") : "",
  )
  const [invoiceId, setInvoiceId] = useState(receipt?.invoiceId ?? "")
  const [usageType, setUsageType] = useState<"api" | "subscription">(
    lockedType ?? (receipt?.usageType === "subscription" ? "subscription" : "api"),
  )
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()
  const [isDeleting, startDeleteTransition] = useTransition()
  const router = useRouter()

  function reset() {
    if (!isEdit) {
      setProvider("")
      setAmount("")
      setPeriodStart("")
      setPeriodEnd("")
      setInvoiceId("")
    }
    setError("")
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (blockedInDemo()) return
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      setError("Enter a valid amount greater than 0")
      return
    }

    const data = {
      provider: provider || null,
      amountUsd: amountNum,
      billingPeriodStart: periodStart || null,
      billingPeriodEnd: periodEnd || null,
      invoiceId: invoiceId.trim() || null,
      usageType,
    }

    startTransition(async () => {
      const result = isEdit
        ? await updateReceipt(receipt!.id, data)
        : await createReceipt(data)

      if (result?.error) {
        setError(result.error)
      } else {
        setOpen(false)
        reset()
      }
    })
  }

  function handleDelete() {
    if (blockedInDemo()) return
    setOpen(false)
    let cancelled = false
    const tid = window.setTimeout(() => {
      if (!cancelled) {
        startDeleteTransition(async () => {
          await deleteReceipt(receipt!.id)
          router.refresh()
        })
      }
    }, 5000)
    toast("Receipt removed", {
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
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      {!hideTrigger && (
        isEdit ? (
          <DialogTrigger render={<button disabled={IS_DEMO} className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-300 transition-colors hover:bg-zinc-100 hover:text-zinc-600" />}>
            <Pencil className="h-3.5 w-3.5" />
          </DialogTrigger>
        ) : (
          <DialogTrigger render={<Button size="sm" variant="outline" disabled={IS_DEMO} className="h-8 gap-1.5 text-xs" />}>
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
            Add receipt
          </DialogTrigger>
        )
      )}
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-zinc-900">
            {title ?? (isEdit ? "Edit receipt" : "Add receipt")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="mt-2 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-600">Provider</Label>
            <Select value={provider} onValueChange={(v) => { if (v) setProvider(v) }}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p.value} value={p.value} className="text-sm">
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!lockedType && (
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-600">Type</Label>
              <div className="flex rounded-lg border border-zinc-200 p-0.5 gap-0.5">
                {(["api", "subscription"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setUsageType(t)}
                    className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                      usageType === t
                        ? "bg-zinc-900 text-white"
                        : "text-zinc-500 hover:text-zinc-700"
                    }`}
                  >
                    {t === "api" ? "API usage" : "Subscription"}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-600">Amount (USD) *</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">
                $
              </span>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setError("") }}
                className="h-9 pl-7 font-mono text-sm"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-600">Period start</Label>
              <Input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-600">Period end</Label>
              <Input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-600">Invoice ID</Label>
            <Input
              type="text"
              placeholder="INV-12345"
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
              className="h-9 text-sm"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex items-center justify-between pt-1">
            {isEdit ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting || IS_DEMO}
                className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition-colors"
              >
                {isDeleting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
                Delete
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => { setOpen(false); reset() }}
                className="h-8 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isPending || IS_DEMO}
                className="h-8 bg-zinc-900 text-xs text-white hover:bg-zinc-700"
              >
                {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : isEdit ? "Save" : "Add"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
