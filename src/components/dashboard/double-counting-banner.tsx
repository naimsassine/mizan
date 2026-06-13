"use client"

import { useState, useEffect } from "react"
import { Info, X } from "lucide-react"
import Link from "next/link"

const STORAGE_KEY = "mizan_doublecounting_dismissed"

export function DoubleCountingBanner({ providers }: { providers: string[] }) {
  const [visible, setVisible] = useState(false)
  const key = [...providers].sort().join(",")

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) !== key) {
      setVisible(true)
    }
  }, [key])

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, key)
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-800">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
      <span className="flex-1">
        Possible double-counting:{" "}
        <span className="font-medium">{providers.join(", ")}</span>{" "}
        appear in both API usage records and receipts this month.{" "}
        Consider reclassifying receipts as &ldquo;Subscription&rdquo; on the{" "}
        <Link href="/receipts" className="underline underline-offset-2">
          Receipts page
        </Link>
        .
      </span>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="ml-1 shrink-0 rounded p-0.5 hover:bg-amber-100 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
