"use client"

import { useState, useTransition, useEffect, useRef } from "react"
import { RefreshCw, Loader2, Mail } from "lucide-react"
import { useRouter } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import { triggerEmailScan } from "@/app/(dashboard)/receipts/actions"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { DisconnectEmailButton } from "./disconnect-email-button"
import { blockedInDemo, IS_DEMO } from "@/lib/demo-client"

interface Props {
  id: string
  emailAddress: string
  emailProvider: string
  status: string
  lastScannedAt: Date | null
  lastScanFound: number | null
  scanScope?: "all" | "subscription"
}

export function EmailConnectionRow({
  id,
  emailAddress,
  emailProvider,
  status,
  lastScannedAt,
  lastScanFound,
  scanScope = "all",
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [scanning, setScanning] = useState(false)
  const router = useRouter()
  // Track the scannedAt value at the moment the user triggered a scan
  const prevScannedAt = useRef(lastScannedAt?.getTime() ?? null)

  // When lastScannedAt changes (scan finished), clear the scanning state
  useEffect(() => {
    const curr = lastScannedAt?.getTime() ?? null
    if (scanning && curr !== prevScannedAt.current) {
      setScanning(false)
    }
    prevScannedAt.current = curr
  }, [lastScannedAt, scanning])

  // Auto-poll every 30 s while a scan is in progress (button-triggered or first-ever)
  const needsPoll = scanning || lastScannedAt === null
  useEffect(() => {
    if (!needsPoll) return
    const interval = setInterval(() => router.refresh(), 30_000)
    return () => clearInterval(interval)
  }, [needsPoll, router])

  function handleScan() {
    if (blockedInDemo()) return
    startTransition(async () => {
      prevScannedAt.current = lastScannedAt?.getTime() ?? null
      setScanning(true)
      await triggerEmailScan(id)
      router.refresh()
    })
  }

  const isScanning = scanning || lastScannedAt === null

  let statusText: string
  if (isScanning) {
    statusText = "Scanning your mailbox — new receipts will appear in a few minutes"
  } else {
    const ago = formatDistanceToNow(lastScannedAt!, { addSuffix: true })
    const found =
      lastScanFound !== null
        ? ` · ${lastScanFound === 0 ? "no new receipts" : `${lastScanFound} receipt${lastScanFound !== 1 ? "s" : ""} found`}`
        : ""
    statusText = `Scanned ${ago}${found}`
  }

  return (
    <Card className="rounded-xl border-zinc-100 bg-white shadow-none border-l-2 border-l-violet-400">
      <CardContent className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <Mail className="h-4 w-4 text-zinc-400" strokeWidth={1.5} />
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-zinc-900">{emailAddress}</p>
              <span className="text-[10px] text-zinc-400 capitalize">{emailProvider}</span>
              {scanScope === "subscription" && (
                <Badge
                  variant="outline"
                  className="h-4 px-1.5 py-0 text-[10px] bg-zinc-50 text-zinc-500 border-zinc-200"
                >
                  subscriptions only
                </Badge>
              )}
            </div>
            <p
              className={`mt-0.5 text-xs flex items-center gap-1 ${
                isScanning ? "text-violet-500" : "text-zinc-400"
              }`}
            >
              {isScanning && <Loader2 className="h-3 w-3 animate-spin flex-shrink-0" />}
              {statusText}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={`text-[10px] px-2 py-0 h-5 ${
              status === "active"
                ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                : "bg-red-50 text-red-700 border-red-100"
            }`}
          >
            {status}
          </Badge>
          <button
            onClick={handleScan}
            disabled={isPending || isScanning || IS_DEMO}
            title="Scan inbox now"
            aria-label="Scan inbox now"
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors duration-200 hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:opacity-50 dark:hover:bg-zinc-800"
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </button>
          <DisconnectEmailButton id={id} email={emailAddress} />
        </div>
      </CardContent>
    </Card>
  )
}
