import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { revalidateOwnerSpend } from "@/lib/cache"
import { IS_DEMO } from "@/lib/demo"

export const maxDuration = 300
import { syncOpenAIIncremental } from "@/lib/sync/openai"
import { syncAnthropicIncremental } from "@/lib/sync/anthropic"
import { syncGeminiIncremental } from "@/lib/sync/gemini"
import { syncBedrockIncremental } from "@/lib/sync/bedrock"
import { syncGroqIncremental } from "@/lib/sync/groq"
import { syncMistralIncremental } from "@/lib/sync/mistral"
import { syncGrokIncremental } from "@/lib/sync/grok"
import { syncOpenRouterIncremental } from "@/lib/sync/openrouter"
import { syncLiteLLMIncremental } from "@/lib/sync/litellm"
import { scanEmails } from "@/lib/scan-emails"
import { sendAlertEmail } from "@/lib/send-alert-email"
import { sendWeeklyDigest } from "@/lib/send-weekly-digest"
import { startOfDay, startOfWeek, startOfMonth } from "date-fns"

// Called daily by Vercel cron — syncs all active connections then checks budget alerts
export async function GET(req: Request) {
  // The demo has no real connections to sync and must never call provider APIs / email / Resend.
  if (IS_DEMO) return NextResponse.json({ skipped: "demo" })

  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [connections, emailConnections] = await Promise.all([
    prisma.providerConnection.findMany({
      where: { status: "active" },
      select: { id: true, provider: true, ownerId: true },
    }),
    prisma.emailConnection.findMany({
      where: { status: "active" },
      select: { id: true, ownerId: true },
    }),
  ])

  await Promise.allSettled(
    connections.map((c) => {
      if (c.provider === "anthropic") return syncAnthropicIncremental(c.id)
      if (c.provider === "gemini") return syncGeminiIncremental(c.id)
      if (c.provider === "bedrock") return syncBedrockIncremental(c.id)
      if (c.provider === "groq") return syncGroqIncremental(c.id)
      if (c.provider === "mistral") return syncMistralIncremental(c.id)
      if (c.provider === "grok") return syncGrokIncremental(c.id)
      if (c.provider === "openrouter") return syncOpenRouterIncremental(c.id)
      if (c.provider === "litellm") return syncLiteLLMIncremental(c.id)
      return syncOpenAIIncremental(c.id)
    })
  )

  // Re-scan email inboxes for new billing emails
  await Promise.allSettled(emailConnections.map((c) => scanEmails(c.id)))

  // Check budget alerts for all owners — include those with only email connections
  const allOwnerIds = [
    ...connections.map((c) => c.ownerId),
    ...emailConnections.map((c) => c.ownerId),
  ]
  const ownerIds = [...new Set(allOwnerIds)]
  await Promise.allSettled(ownerIds.map(checkBudgetAlerts))

  // Nightly sync wrote usage rows / receipts / alerts — bust each owner's cached aggregates so
  // the next dashboard load reflects them instead of waiting out the revalidate window.
  for (const ownerId of ownerIds) revalidateOwnerSpend(ownerId)

  // Send weekly digests to users whose chosen day matches today
  const todayDow = new Date().getDay() // 0=Sun … 6=Sat
  const digestUsers = await prisma.userSettings.findMany({
    where: { weeklyDigest: true, weeklyDigestDay: todayDow },
    select: { clerkUserId: true },
  })
  await Promise.allSettled(digestUsers.map((u) => sendWeeklyDigest(u.clerkUserId)))

  return NextResponse.json({
    synced: connections.length,
    emailsScanned: emailConnections.length,
    digestsSent: digestUsers.length,
  })
}

async function checkBudgetAlerts(ownerId: string) {
  const rules = await prisma.budgetRule.findMany({ where: { ownerId } })
  if (rules.length === 0) return

  const now = new Date()

  for (const rule of rules) {
    // Determine current period start
    const periodStart =
      rule.period === "daily"
        ? startOfDay(now)
        : rule.period === "weekly"
          ? startOfWeek(now, { weekStartsOn: 1 })
          : startOfMonth(now)

    // Check if an alert was already triggered this period
    const existingAlert = await prisma.alert.findFirst({
      where: { budgetRuleId: rule.id, triggeredAt: { gte: periodStart } },
    })
    if (existingAlert) continue

    // Calculate current period spend — include both API usage records and receipts
    const [apiSpend, receiptSpend] = await Promise.all([
      prisma.usageRecord.aggregate({
        where: {
          ownerId,
          date: { gte: periodStart },
          ...(rule.provider ? { provider: rule.provider } : {}),
        },
        _sum: { costUsd: true },
      }),
      prisma.receipt.aggregate({
        where: {
          ownerId,
          OR: [
            { billingPeriodStart: { gte: periodStart } },
            { billingPeriodStart: null, parsedAt: { gte: periodStart } },
            { billingPeriodStart: null, parsedAt: null, createdAt: { gte: periodStart } },
          ],
          ...(rule.provider ? { provider: rule.provider } : {}),
        },
        _sum: { amountUsd: true },
      }),
    ])

    const spendUsd = Number(apiSpend._sum.costUsd ?? 0) + Number(receiptSpend._sum.amountUsd ?? 0)
    const threshold = (Number(rule.limitUsd) * rule.alertAtPct) / 100

    if (spendUsd >= threshold) {
      await prisma.alert.create({
        data: { budgetRuleId: rule.id, spendUsd },
      })
      try {
        await sendAlertEmail({
          ownerId,
          ownerType: rule.ownerType,
          spendUsd,
          limitUsd: Number(rule.limitUsd),
          period: rule.period,
          provider: rule.provider,
          alertAtPct: rule.alertAtPct,
        })
      } catch {
        // Email failures don't break the cron
      }
    }
  }
}
