import {
  eachDayOfInterval,
  format,
  getDaysInMonth,
  getDaysInYear,
  startOfDay,
} from "date-fns"

// Shared subscription-projection logic. Subscriptions are the source of truth for subscription
// spend on every dashboard: instead of summing subscription receipts (which would only cover the
// single period they were billed for), we project each active plan forward and amortize its
// per-period cost evenly across the days it covers. This keeps recurring plans showing up every
// period and avoids double-counting when a confirming receipt also arrives.

export interface SubscriptionLike {
  amountUsd: number
  period: "monthly" | "yearly"
  startDate: Date
  endDate: Date | null
  status: "active" | "cancelled"
}

// Per-day cost a single subscription contributes on a given day (its period amount spread evenly
// across that day's month or year). Returns 0 if the subscription isn't active on that day.
function dailyShareOn(sub: SubscriptionLike, day: Date): number {
  const d = startOfDay(day).getTime()
  if (d < startOfDay(sub.startDate).getTime()) return 0
  if (sub.endDate && d > startOfDay(sub.endDate).getTime()) return 0
  const denom = sub.period === "yearly" ? getDaysInYear(day) : getDaysInMonth(day)
  return sub.amountUsd / denom
}

/**
 * Per-day subscription cost across [start, end] (inclusive), summed over all subscriptions.
 * Keys are `yyyy-MM-dd`. Only days with non-zero cost are included.
 */
export function subscriptionDailyCost(
  subs: SubscriptionLike[],
  start: Date,
  end: Date,
): Map<string, number> {
  const map = new Map<string, number>()
  if (subs.length === 0 || start > end) return map
  for (const day of eachDayOfInterval({ start, end })) {
    let total = 0
    for (const sub of subs) total += dailyShareOn(sub, day)
    if (total > 0) map.set(format(day, "yyyy-MM-dd"), total)
  }
  return map
}

/**
 * Total projected subscription cost accrued between [start, asOf] (inclusive) — i.e. month-to-date
 * when called with (monthStart, now). Prorates partial months/years so it stays apples-to-apples
 * with API spend, which is also only counted up to today.
 */
export function subscriptionMtd(subs: SubscriptionLike[], start: Date, asOf: Date): number {
  let total = 0
  for (const v of subscriptionDailyCost(subs, start, asOf).values()) total += v
  return total
}
