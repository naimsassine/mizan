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
import { Plus, Loader2 } from "lucide-react"
import { createSubscription, updateSubscription } from "@/app/(dashboard)/connections/actions"
import { format } from "date-fns"
import { blockedInDemo, IS_DEMO } from "@/lib/demo-client"

const PROVIDERS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google" },
  { value: "cursor", label: "Cursor" },
  { value: "github", label: "GitHub Copilot" },
  { value: "perplexity", label: "Perplexity" },
  { value: "grok", label: "xAI / Grok" },
  { value: "mistral", label: "Mistral AI" },
  { value: "other", label: "Other" },
]

export interface SubscriptionData {
  id: string
  name: string
  provider: string | null
  amountUsd: number | string
  period: "monthly" | "yearly"
  startDate: Date
}

interface Props {
  subscription?: SubscriptionData
  open?: boolean
  onOpenChange?: (v: boolean) => void
  hideTrigger?: boolean
}

export function SubscriptionFormDialog({ subscription, open: openProp, onOpenChange, hideTrigger }: Props) {
  const isEdit = !!subscription
  const [internalOpen, setInternalOpen] = useState(false)
  const open = openProp ?? internalOpen
  const setOpen = (v: boolean) => {
    if (onOpenChange) onOpenChange(v)
    else setInternalOpen(v)
  }

  const [name, setName] = useState(subscription?.name ?? "")
  const [provider, setProvider] = useState(subscription?.provider ?? "")
  const [amount, setAmount] = useState(subscription ? Number(subscription.amountUsd).toFixed(2) : "")
  const [period, setPeriod] = useState<"monthly" | "yearly">(subscription?.period ?? "monthly")
  const [startDate, setStartDate] = useState(
    subscription?.startDate ? format(subscription.startDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
  )
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  function reset() {
    if (!isEdit) {
      setName("")
      setProvider("")
      setAmount("")
      setPeriod("monthly")
      setStartDate(format(new Date(), "yyyy-MM-dd"))
    }
    setError("")
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (blockedInDemo()) return
    if (!name.trim()) {
      setError("Enter a name (e.g. ChatGPT Plus)")
      return
    }
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      setError("Enter a valid amount greater than 0")
      return
    }

    const data = {
      name: name.trim(),
      provider: provider || null,
      amountUsd: amountNum,
      period,
      startDate,
    }

    startTransition(async () => {
      const result = isEdit
        ? await updateSubscription(subscription!.id, data)
        : await createSubscription(data)
      if (result?.error) {
        setError(result.error)
      } else {
        setOpen(false)
        reset()
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      {!hideTrigger && (
        <DialogTrigger render={<Button size="sm" variant="outline" disabled={IS_DEMO} className="h-8 gap-1.5 text-xs" />}>
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
          Add subscription
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-zinc-900">
            {isEdit ? "Edit subscription" : "Add subscription"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="mt-2 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-600">Name *</Label>
            <Input
              type="text"
              placeholder="ChatGPT Plus"
              value={name}
              onChange={(e) => { setName(e.target.value); setError("") }}
              className="h-9 text-sm"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-600">Provider</Label>
            <Select value={provider} onValueChange={(v) => { if (v) setProvider(v) }}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select provider (optional)" />
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-600">Price (USD) *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">$</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="20.00"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setError("") }}
                  className="h-9 pl-7 font-mono text-sm"
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-600">Billing</Label>
              <div className="flex rounded-lg border border-zinc-200 p-0.5 gap-0.5">
                {(["monthly", "yearly"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setPeriod(t)}
                    className={`flex-1 rounded-md py-1.5 text-xs font-medium capitalize transition-colors ${
                      period === t ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-700"
                    }`}
                  >
                    {t === "monthly" ? "Monthly" : "Yearly"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-600">Start date</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-9 text-sm"
            />
            <p className="text-[11px] text-zinc-400">
              When the plan began. We project the cost forward from here every {period === "yearly" ? "year" : "month"}.
            </p>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
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
        </form>
      </DialogContent>
    </Dialog>
  )
}
