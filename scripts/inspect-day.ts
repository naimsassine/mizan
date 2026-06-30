/**
 * Investigate a single day's spend for one owner — the three sources the dashboard sums:
 * API usage records, api-type receipts, and projected subscriptions. Reuses the same
 * getDayBreakdown() that powers the in-app day-detail drill-down, so the numbers reconcile.
 *
 *   npx tsx scripts/inspect-day.ts <YYYY-MM-DD> [ownerId]
 *   npx tsx scripts/inspect-day.ts --owners            # list owners + their total spend, pick one
 *
 * ownerId defaults to the demo workspace ("demo-workspace"). For your real data, run --owners
 * first to find your Clerk user/org id, then pass it.
 */
import "dotenv/config"
import { format } from "date-fns"
import { prisma } from "../src/lib/prisma"
import { getDayBreakdown } from "../src/lib/day-breakdown"
import { DEMO_OWNER_ID } from "../src/lib/demo"

const usd = (n: number) => `$${n.toFixed(2)}`

async function listOwners() {
  const rows = await prisma.usageRecord.groupBy({
    by: ["ownerId"],
    _sum: { costUsd: true },
    _count: true,
    _max: { date: true },
  })
  console.log(`\nOwners with usage data (${rows.length}):\n`)
  for (const r of rows.sort((a, b) => Number(b._sum.costUsd ?? 0) - Number(a._sum.costUsd ?? 0))) {
    console.log(
      `  ${r.ownerId.padEnd(36)}  ${usd(Number(r._sum.costUsd ?? 0)).padStart(12)}  ` +
        `${r._count} rows  last ${r._max.date ? format(r._max.date, "yyyy-MM-dd") : "—"}`,
    )
  }
  console.log()
}

async function inspectDay(dateStr: string, ownerId: string) {
  const b = await getDayBreakdown(ownerId, dateStr)
  console.log(`\n=== ${dateStr} · owner "${ownerId}" ===\n`)

  console.log(`API usage records: ${b.apiRecords.length}`)
  for (const u of b.apiRecords) {
    console.log(
      `  ${usd(u.costUsd).padStart(10)}  ${u.provider}/${u.model}  ` +
        `in=${u.inputTokens} out=${u.outputTokens}  src=${u.source}`,
    )
  }
  console.log(`  → API subtotal: ${usd(b.apiTotal)}\n`)

  console.log(`Receipts effective on this day: ${b.receipts.length}`)
  for (const r of b.receipts) {
    console.log(
      `  ${usd(r.amountUsd).padStart(10)}  ${r.provider ?? "—"}  type=${r.usageType}  ` +
        `src=${r.source}  inv=${r.invoiceId ?? "—"}  ${r.counted ? "[counted]" : "[evidence only]"}`,
    )
  }
  console.log(`  → Receipt subtotal (api/manual only): ${usd(b.receiptTotal)}\n`)

  console.log(`Active subscriptions: ${b.subscriptions.length}`)
  for (const s of b.subscriptions) {
    console.log(
      `  ${s.provider}  ${usd(s.amountUsd)}/${s.period}  status=${s.status}  ` +
        `day's share ${usd(s.dailyShare)}`,
    )
  }
  console.log(`  → Subscription subtotal (amortized for the day): ${usd(b.subscriptionTotal)}\n`)

  console.log(`TOTAL for ${dateStr}: ${usd(b.total)}`)
  console.log(
    `  (API ${usd(b.apiTotal)} + receipts ${usd(b.receiptTotal)} + subs ${usd(b.subscriptionTotal)})\n`,
  )
}

async function main() {
  const arg = process.argv[2]
  if (!arg || arg === "--owners") {
    await listOwners()
    if (!arg) console.log("Pass a date: npx tsx scripts/inspect-day.ts 2026-06-13 [ownerId]\n")
    return
  }
  const ownerId = process.argv[3] ?? DEMO_OWNER_ID
  await inspectDay(arg, ownerId)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
