import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { syncOpenAIIncremental } from "@/lib/sync/openai"
import { syncAnthropicIncremental } from "@/lib/sync/anthropic"
import { syncGeminiIncremental } from "@/lib/sync/gemini"
import { syncBedrockIncremental } from "@/lib/sync/bedrock"
import { startOfDay, startOfWeek, startOfMonth } from "date-fns"

// Called daily by Vercel cron — syncs all active connections then checks budget alerts
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const connections = await prisma.providerConnection.findMany({
    where: { status: "active" },
    select: { id: true, provider: true, ownerId: true },
  })

  await Promise.allSettled(
    connections.map((c) => {
      if (c.provider === "anthropic") return syncAnthropicIncremental(c.id)
      if (c.provider === "gemini") return syncGeminiIncremental(c.id)
      if (c.provider === "bedrock") return syncBedrockIncremental(c.id)
      return syncOpenAIIncremental(c.id)
    })
  )

  // Check budget alerts for all owners that have rules
  const ownerIds = [...new Set(connections.map((c) => c.ownerId))]
  await Promise.allSettled(ownerIds.map(checkBudgetAlerts))

  return NextResponse.json({ synced: connections.length })
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

    // Calculate current period spend
    const spend = await prisma.usageRecord.aggregate({
      where: {
        ownerId,
        date: { gte: periodStart },
        ...(rule.provider ? { provider: rule.provider } : {}),
      },
      _sum: { costUsd: true },
    })

    const spendUsd = Number(spend._sum.costUsd ?? 0)
    const threshold = (Number(rule.limitUsd) * rule.alertAtPct) / 100

    if (spendUsd >= threshold) {
      await prisma.alert.create({
        data: { budgetRuleId: rule.id, spendUsd },
      })
    }
  }
}
