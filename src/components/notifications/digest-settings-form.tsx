"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { saveDigestSettings } from "@/app/(dashboard)/notifications/actions"

const DAYS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
]

const ALL_PROVIDERS = [
  { value: "openai",    label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "gemini",    label: "Google Gemini" },
  { value: "bedrock",   label: "AWS Bedrock" },
  { value: "groq",      label: "Groq" },
  { value: "mistral",   label: "Mistral AI" },
  { value: "grok",      label: "xAI / Grok" },
  { value: "openrouter",  label: "OpenRouter" },
  { value: "litellm",     label: "LiteLLM" },
]

interface Props {
  defaultEnabled: boolean
  defaultDay: number
  defaultProviders: string[] // empty = all
}

export function DigestSettingsForm({ defaultEnabled, defaultDay, defaultProviders }: Props) {
  const [enabled, setEnabled] = useState(defaultEnabled)
  const [day, setDay] = useState(String(defaultDay))
  const [providers, setProviders] = useState<string[]>(defaultProviders)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  const allSelected = providers.length === 0

  function toggleProvider(value: string) {
    setProviders((prev) => {
      if (prev.includes(value)) {
        const next = prev.filter((p) => p !== value)
        return next
      }
      return [...prev, value]
    })
    setSaved(false)
  }

  function toggleAll() {
    setProviders([])
    setSaved(false)
  }

  function handleSave() {
    startTransition(async () => {
      await saveDigestSettings({
        weeklyDigest: enabled,
        weeklyDigestDay: parseInt(day),
        weeklyDigestProviders: providers,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <div className="space-y-5">
      {/* Enable toggle */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-900">Weekly email digest</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            A summary of your AI spend, usage, and top models — delivered to your inbox.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => { setEnabled((v) => !v); setSaved(false) }}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none ${
            enabled ? "bg-zinc-900" : "bg-zinc-200"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ${
              enabled ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {enabled && (
        <div className="space-y-4 pl-0">
          {/* Delivery day */}
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-600">Delivery day</Label>
            <Select
              value={day}
              onValueChange={(v) => { if (v !== null) { setDay(v); setSaved(false) } }}
            >
              <SelectTrigger className="h-9 w-48 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS.map((d) => (
                  <SelectItem key={d.value} value={d.value} className="text-sm">
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Provider filter */}
          <div className="space-y-2">
            <Label className="text-xs text-zinc-600">Include providers</Label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={toggleAll}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  allSelected
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 text-zinc-500 hover:border-zinc-400 hover:text-zinc-700"
                }`}
              >
                All providers
              </button>
              {ALL_PROVIDERS.map((p) => {
                const selected = !allSelected && providers.includes(p.value)
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => toggleProvider(p.value)}
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                      selected
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 text-zinc-500 hover:border-zinc-400 hover:text-zinc-700"
                    }`}
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-zinc-400">
              {allSelected
                ? "Digest will include all connected providers."
                : `Digest will include: ${providers.map((v) => ALL_PROVIDERS.find((p) => p.value === v)?.label ?? v).join(", ")}.`}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 pt-1">
        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={isPending}
          className="h-8 bg-zinc-900 text-xs text-white hover:bg-zinc-700"
        >
          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
        </Button>
        {saved && <span className="text-xs text-emerald-600">Saved</span>}
      </div>
    </div>
  )
}
