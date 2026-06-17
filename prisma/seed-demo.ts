/**
 * Seed the read-only demo workspace with realistic dummy data.
 *
 *   DATABASE_URL=... npx tsx prisma/seed-demo.ts
 *   # or: npm run seed:demo   (loads .env via dotenv)
 *
 * Everything is written under a single owner (DEMO_OWNER_ID, a personal/"user" workspace) so the
 * demo deployment — which resolves every request to that owner — renders a fully populated
 * dashboard with no sign-in and no real API keys. Re-running is idempotent: it wipes the demo
 * owner's data first, then regenerates it. Numbers are deterministic (seeded RNG) so the demo
 * looks the same on every reseed.
 *
 * IMPORTANT: keep DEMO_OWNER_ID in sync with src/lib/demo.ts.
 */
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaNeon } from "@prisma/adapter-neon"

const DEMO_OWNER_ID = "demo-workspace"
const OWNER_TYPE = "user" as const

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error("DATABASE_URL is not set. Point it at the demo database before seeding.")
  process.exit(1)
}
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) })

// ---- deterministic RNG (mulberry32) so reseeds produce identical data --------------------------
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A UTC-midnight Date `daysAgo` days before today (matches the @db.Date columns). */
function dayUTC(daysAgo: number): Date {
  const now = new Date()
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  d.setUTCDate(d.getUTCDate() - daysAgo)
  return d
}

// ---- provider / model catalogue with per-1M-token pricing --------------------------------------
type ModelSpec = { model: string; inPrice: number; outPrice: number; inBase: number; outBase: number }
type ProviderSpec = { provider: "openai" | "anthropic" | "gemini" | "groq"; days: number; models: ModelSpec[] }

const PROVIDERS: ProviderSpec[] = [
  {
    provider: "openai",
    days: 90,
    models: [
      { model: "gpt-4o", inPrice: 2.5, outPrice: 10, inBase: 1_200_000, outBase: 250_000 },
      { model: "gpt-4o-mini", inPrice: 0.15, outPrice: 0.6, inBase: 2_500_000, outBase: 600_000 },
    ],
  },
  {
    provider: "anthropic",
    days: 90,
    models: [
      { model: "claude-sonnet-4-5", inPrice: 3, outPrice: 15, inBase: 700_000, outBase: 180_000 },
      { model: "claude-haiku-4-5", inPrice: 1, outPrice: 5, inBase: 1_500_000, outBase: 120_000 },
    ],
  },
  {
    provider: "gemini",
    days: 75,
    models: [
      { model: "gemini-2.5-pro", inPrice: 1.25, outPrice: 10, inBase: 500_000, outBase: 120_000 },
      { model: "gemini-2.5-flash", inPrice: 0.3, outPrice: 2.5, inBase: 1_800_000, outBase: 400_000 },
    ],
  },
  {
    provider: "groq",
    days: 30,
    models: [
      { model: "llama-3.3-70b-versatile", inPrice: 0.59, outPrice: 0.79, inBase: 900_000, outBase: 200_000 },
      { model: "llama-3.1-8b-instant", inPrice: 0.05, outPrice: 0.08, inBase: 1_500_000, outBase: 300_000 },
    ],
  },
]

/** Daily activity multiplier — weekend dip, mild upward trend, jitter, and a couple of spikes. */
function dailyFactor(daysAgo: number, totalDays: number, rand: () => number): number {
  const date = dayUTC(daysAgo)
  const dow = date.getUTCDay() // 0=Sun 6=Sat
  const weekend = dow === 0 || dow === 6 ? 0.45 : 1
  const progress = (totalDays - daysAgo) / totalDays // 0 (oldest) → 1 (newest)
  const trend = 0.85 + 0.3 * progress
  const jitter = 0.8 + rand() * 0.4
  // Two deterministic spikes: a launch day and a load-test day
  const spike = daysAgo === 9 || daysAgo === 23 ? 2.3 : 1
  return weekend * trend * jitter * spike
}

async function main() {
  console.log(`Seeding demo workspace "${DEMO_OWNER_ID}"…`)

  // 1) Wipe any previous demo data (FK cascades handle usage rows + alerts).
  await prisma.usageRecord.deleteMany({ where: { ownerId: DEMO_OWNER_ID } })
  await prisma.receipt.deleteMany({ where: { ownerId: DEMO_OWNER_ID } })
  await prisma.budgetRule.deleteMany({ where: { ownerId: DEMO_OWNER_ID } }) // cascades alerts
  await prisma.emailConnection.deleteMany({ where: { ownerId: DEMO_OWNER_ID } })
  await prisma.providerConnection.deleteMany({ where: { ownerId: DEMO_OWNER_ID } })
  await prisma.userSettings.deleteMany({ where: { clerkUserId: DEMO_OWNER_ID } })

  // 2) Preferences row so the Settings page shows configured values.
  await prisma.userSettings.create({
    data: {
      clerkUserId: DEMO_OWNER_ID,
      backfillMonths: 3,
      notificationEmail: true,
      weeklyDigest: true,
      weeklyDigestDay: 1,
      weeklyDigestProviders: "",
    },
  })

  // 3) Provider connections + their daily usage records.
  let usageRows = 0
  for (let pi = 0; pi < PROVIDERS.length; pi++) {
    const spec = PROVIDERS[pi]
    const conn = await prisma.providerConnection.create({
      data: {
        ownerId: DEMO_OWNER_ID,
        ownerType: OWNER_TYPE,
        provider: spec.provider,
        // Demo connections never sync, so credentials are a placeholder and never decrypted.
        encCredentials: "demo",
        status: "active",
        lastSyncedAt: (() => {
          const d = new Date()
          d.setUTCHours(6, 0, 0, 0)
          return d
        })(),
        backfillFrom: dayUTC(spec.days),
        backfillStatus: "complete",
      },
    })

    const records: {
      connectionId: string
      ownerId: string
      ownerType: "user"
      date: Date
      provider: "openai" | "anthropic" | "gemini" | "groq"
      model: string
      inputTokens: bigint
      outputTokens: bigint
      costUsd: number
      source: "api_poll"
    }[] = []

    for (let d = spec.days - 1; d >= 0; d--) {
      const rand = rng(pi * 100_003 + d * 31 + 7)
      const factor = dailyFactor(d, spec.days, rand)
      for (const m of spec.models) {
        const inTok = Math.round(m.inBase * factor * (0.9 + rand() * 0.2))
        const outTok = Math.round(m.outBase * factor * (0.9 + rand() * 0.2))
        const cost = (inTok / 1_000_000) * m.inPrice + (outTok / 1_000_000) * m.outPrice
        records.push({
          connectionId: conn.id,
          ownerId: DEMO_OWNER_ID,
          ownerType: OWNER_TYPE,
          date: dayUTC(d),
          provider: spec.provider,
          model: m.model,
          inputTokens: BigInt(inTok),
          outputTokens: BigInt(outTok),
          costUsd: Number(cost.toFixed(6)),
          source: "api_poll",
        })
      }
    }

    // Batch insert (chunked to stay well under any statement-size limits).
    for (let i = 0; i < records.length; i += 200) {
      await prisma.usageRecord.createMany({ data: records.slice(i, i + 200) })
    }
    usageRows += records.length
    console.log(`  ${spec.provider}: ${records.length} usage records over ${spec.days} days`)
  }

  // 4) A few receipts (subscriptions + API invoices) for the Receipts page.
  await prisma.receipt.createMany({
    data: [
      {
        ownerId: DEMO_OWNER_ID,
        ownerType: OWNER_TYPE,
        provider: "cursor",
        amountUsd: 20.0,
        usageType: "subscription",
        source: "receipt_email",
        billingPeriodStart: dayUTC(38),
        billingPeriodEnd: dayUTC(8),
        parsedAt: dayUTC(8),
      },
      {
        ownerId: DEMO_OWNER_ID,
        ownerType: OWNER_TYPE,
        provider: "openai",
        amountUsd: 20.0,
        usageType: "subscription",
        source: "receipt_email",
        billingPeriodStart: dayUTC(34),
        billingPeriodEnd: dayUTC(4),
        parsedAt: dayUTC(4),
      },
      {
        ownerId: DEMO_OWNER_ID,
        ownerType: OWNER_TYPE,
        provider: "anthropic",
        amountUsd: 128.45,
        usageType: "api",
        source: "receipt_upload",
        invoiceId: "INV-2026-0417",
        billingPeriodStart: dayUTC(45),
        billingPeriodEnd: dayUTC(15),
        parsedAt: dayUTC(13),
      },
      {
        ownerId: DEMO_OWNER_ID,
        ownerType: OWNER_TYPE,
        provider: "openai",
        amountUsd: 312.9,
        usageType: "api",
        source: "receipt_email",
        invoiceId: "A1B2-C3D4",
        billingPeriodStart: dayUTC(45),
        billingPeriodEnd: dayUTC(15),
        parsedAt: dayUTC(14),
      },
    ],
  })

  // 5) Budget rules + one triggered (unacknowledged) alert so the bell badge + history populate.
  const monthlyRule = await prisma.budgetRule.create({
    data: {
      ownerId: DEMO_OWNER_ID,
      ownerType: OWNER_TYPE,
      provider: null,
      period: "monthly",
      limitUsd: 800.0,
      alertAtPct: 75,
    },
  })
  await prisma.budgetRule.create({
    data: {
      ownerId: DEMO_OWNER_ID,
      ownerType: OWNER_TYPE,
      provider: "openai",
      period: "weekly",
      limitUsd: 120.0,
      alertAtPct: 90,
    },
  })
  await prisma.budgetRule.create({
    data: {
      ownerId: DEMO_OWNER_ID,
      ownerType: OWNER_TYPE,
      provider: "anthropic",
      period: "monthly",
      limitUsd: 250.0,
      alertAtPct: 80,
    },
  })
  await prisma.alert.create({
    data: {
      budgetRuleId: monthlyRule.id,
      spendUsd: 612.4,
      triggeredAt: dayUTC(3),
      acknowledgedAt: null,
    },
  })

  console.log(`Done. ${usageRows} usage records, 4 connections, 4 receipts, 3 budget rules, 1 alert.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
