"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

interface SyncPollerProps {
  /** IDs of connections currently syncing (pending or in_progress) */
  syncingIds: string[]
}

const POLL_INTERVAL_MS = 4000

export function SyncPoller({ syncingIds }: SyncPollerProps) {
  const router = useRouter()
  const countRef = useRef(syncingIds.length)
  countRef.current = syncingIds.length

  useEffect(() => {
    if (syncingIds.length === 0) return

    const interval = setInterval(() => {
      if (countRef.current > 0) {
        router.refresh()
      }
    }, POLL_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [syncingIds.length > 0, router]) // re-run only when syncing state flips

  return null
}
