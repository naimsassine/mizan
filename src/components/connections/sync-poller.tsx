"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

interface SyncPollerProps {
  /** IDs of connections currently syncing (pending or in_progress) */
  syncingIds: string[]
}

const POLL_INTERVAL_MS = 4000
// Stop polling after 5 minutes to avoid infinite loops on stuck syncs (bug #5)
const MAX_POLLS = 75

export function SyncPoller({ syncingIds }: SyncPollerProps) {
  const router = useRouter()
  const countRef = useRef(syncingIds.length)
  const pollCountRef = useRef(0)
  countRef.current = syncingIds.length

  useEffect(() => {
    if (syncingIds.length === 0) return
    pollCountRef.current = 0

    const interval = setInterval(() => {
      if (countRef.current > 0 && pollCountRef.current < MAX_POLLS) {
        pollCountRef.current++
        router.refresh()
      } else {
        clearInterval(interval)
      }
    }, POLL_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [syncingIds.length > 0, router]) // re-run only when syncing state flips

  return null
}
