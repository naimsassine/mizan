"use client"

import { useState, useTransition } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { saveBackfillMonths } from "@/app/(dashboard)/settings/actions"
import { Loader2 } from "lucide-react"

const options = [
  { value: "1", label: "1 month" },
  { value: "3", label: "3 months (default)" },
  { value: "6", label: "6 months" },
  { value: "12", label: "12 months" },
  { value: "24", label: "24 months" },
]

interface Props {
  defaultMonths: number
  ownerType: "user" | "org"
  ownerId: string
}

export function BackfillMonthsForm({ defaultMonths, ownerType, ownerId }: Props) {
  const [months, setMonths] = useState(String(defaultMonths))
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  function handleChange(value: string | null) {
    if (!value) return
    setMonths(value)
    setSaved(false)
    startTransition(async () => {
      await saveBackfillMonths(ownerType, ownerId, parseInt(value))
      setSaved(true)
    })
  }

  return (
    <div className="flex items-center gap-4">
      <Label className="text-xs text-zinc-600">Backfill window for new connections</Label>
      <div className="flex items-center gap-2">
        <Select value={months} onValueChange={handleChange} disabled={isPending}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isPending && <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />}
        {saved && !isPending && (
          <span className="text-xs text-emerald-600">Saved</span>
        )}
      </div>
    </div>
  )
}
