"use client"

import { useState, useTransition } from "react"
import { Plus, Loader2, Lightbulb } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createBudgetRule } from "@/app/(dashboard)/notifications/actions"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { blockedInDemo, IS_DEMO } from "@/lib/demo-client"

interface SpendSuggestions {
  monthly: number
  weekly: number
  daily: number
}

export function AddRuleDialog({ spendSuggestions }: { spendSuggestions?: SpendSuggestions }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [provider, setProvider] = useState("all")
  const [period, setPeriod] = useState("monthly")
  const [limit, setLimit] = useState("")
  const [threshold, setThreshold] = useState("80")
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (blockedInDemo()) return
    const fd = new FormData()
    fd.set("provider", provider)
    fd.set("period", period)
    fd.set("limitUsd", limit)
    fd.set("alertAtPct", threshold)
    startTransition(async () => {
      const result = await createBudgetRule(fd)
      if (result?.error) {
        setError(result.error)
      } else {
        setOpen(false)
        setProvider("all")
        setPeriod("monthly")
        setLimit("")
        setThreshold("80")
        toast.success("Budget rule created", { description: `Alert fires when ${period} spend reaches ${threshold}% of $${limit}.` })
        router.refresh()
      }
    })
  }

  const suggestion = spendSuggestions
    ? period === "monthly"
      ? spendSuggestions.monthly
      : period === "weekly"
        ? spendSuggestions.weekly
        : spendSuggestions.daily
    : null

  const suggestedLimit =
    suggestion && suggestion > 0 ? Math.ceil(suggestion * 1.25 * 100) / 100 : null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" disabled={IS_DEMO} className="h-8 bg-zinc-900 text-xs text-white hover:bg-zinc-700 gap-1.5" />
        }
      >
        <Plus className="h-3.5 w-3.5" />
        Add rule
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-zinc-900">New budget rule</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="mt-2 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-600">Provider</Label>
            <Select value={provider} onValueChange={(v) => { if (v !== null) setProvider(v) }}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-sm">All providers</SelectItem>
                <SelectItem value="openai" className="text-sm">OpenAI</SelectItem>
                <SelectItem value="anthropic" className="text-sm">Anthropic</SelectItem>
                <SelectItem value="gemini" className="text-sm">Google Gemini</SelectItem>
                <SelectItem value="bedrock" className="text-sm">AWS Bedrock</SelectItem>
                <SelectItem value="groq" className="text-sm">Groq</SelectItem>
                <SelectItem value="mistral" className="text-sm">Mistral AI</SelectItem>
                <SelectItem value="grok" className="text-sm">xAI / Grok</SelectItem>
                <SelectItem value="openrouter" className="text-sm">OpenRouter</SelectItem>
                <SelectItem value="litellm" className="text-sm">LiteLLM</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-600">Period</Label>
            <Select value={period} onValueChange={(v) => { if (v !== null) setPeriod(v) }}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily" className="text-sm">Daily</SelectItem>
                <SelectItem value="weekly" className="text-sm">Weekly</SelectItem>
                <SelectItem value="monthly" className="text-sm">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-600">Budget ($)</Label>
              <Input
                type="number" min="0.01" step="0.01" placeholder="100.00"
                value={limit} onChange={(e) => setLimit(e.target.value)}
                className="h-9 font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-600">Alert at (%)</Label>
              <Input
                type="number" min="1" max="100" placeholder="80"
                value={threshold} onChange={(e) => setThreshold(e.target.value)}
                className="h-9 font-mono text-sm"
              />
            </div>
          </div>

          {/* Suggested limit based on recent spend */}
          {suggestedLimit !== null && !limit && (
            <button
              type="button"
              onClick={() => setLimit(suggestedLimit.toFixed(2))}
              className="flex w-full items-center gap-2 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2.5 text-left transition-colors hover:bg-zinc-100"
            >
              <Lightbulb className="h-3.5 w-3.5 shrink-0 text-zinc-400" strokeWidth={1.5} />
              <span className="text-xs text-zinc-500">
                Suggested:{" "}
                <span className="font-medium text-zinc-900">${suggestedLimit.toFixed(2)}</span>
                <span className="ml-1 text-zinc-400">
                  (125% of your recent {period} spend of ${suggestion!.toFixed(2)})
                </span>
              </span>
            </button>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)} className="h-8 text-xs">
              Cancel
            </Button>
            <Button
              type="submit" size="sm"
              disabled={!limit || isPending || IS_DEMO}
              className="h-8 bg-zinc-900 text-xs text-white hover:bg-zinc-700"
            >
              {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
