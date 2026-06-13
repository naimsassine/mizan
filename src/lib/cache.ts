import "server-only"
import { revalidateTag } from "next/cache"

// Cache-tag helpers for per-owner data caching (see unstable_cache usage in dashboard pages).
// Each owner (user or org) gets its own tagged cache entries so invalidating one owner never
// busts another's cache.

export const ownerUsageTag = (ownerId: string) => `usage:${ownerId}`
export const ownerReceiptsTag = (ownerId: string) => `receipts:${ownerId}`
export const ownerAlertsTag = (ownerId: string) => `alerts:${ownerId}`

/**
 * Invalidate an owner's cached spend data. Call after anything that writes usage records or
 * receipts (provider syncs, email scans, manual receipt edits) so dashboards recompute on the
 * next read instead of serving stale aggregates.
 *
 * Must run inside a Server Action, Route Handler, or `after()` callback.
 */
export function revalidateOwnerSpend(ownerId: string) {
  // expire: 0 = invalidate immediately so the next read is fresh (these fire on mutations/syncs
  // where the user expects to see their change right away, not stale-while-revalidate).
  revalidateTag(ownerUsageTag(ownerId), { expire: 0 })
  revalidateTag(ownerReceiptsTag(ownerId), { expire: 0 })
  // Alert badge / notification aggregates derive from spend, so refresh them too.
  revalidateTag(ownerAlertsTag(ownerId), { expire: 0 })
}

/** Invalidate only the unacknowledged-alert count (cheap, used by the sidebar badge). */
export function revalidateOwnerAlerts(ownerId: string) {
  revalidateTag(ownerAlertsTag(ownerId), { expire: 0 })
}
