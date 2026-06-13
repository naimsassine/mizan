import { clerkClient } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"
import { resend } from "@/lib/resend"
import { startOfWeek, subWeeks, endOfWeek } from "date-fns"

const providerLabel: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  bedrock: "AWS Bedrock",
  groq: "Groq",
  mistral: "Mistral AI",
  grok: "xAI / Grok",
  openrouter: "OpenRouter",
  litellm: "LiteLLM",
}

function fmt(n: number): string {
  return n.toFixed(2)
}

function pct(current: number, prior: number): string {
  if (prior === 0) return current > 0 ? "+∞%" : "0%"
  const change = ((current - prior) / prior) * 100
  return (change >= 0 ? "+" : "") + change.toFixed(0) + "%"
}

function pctColor(current: number, prior: number): string {
  if (prior === 0) return current > 0 ? "#ef4444" : "#71717a"
  return current <= prior ? "#16a34a" : "#ef4444"
}

function buildDigestHtml(params: {
  thisWeekSpend: number
  priorWeekSpend: number
  byProvider: { provider: string; spend: number }[]
  topModels: { model: string; provider: string; spend: number }[]
  appUrl: string
  weekLabel: string
}): string {
  const { thisWeekSpend, priorWeekSpend, byProvider, topModels, appUrl, weekLabel } = params
  const changeStr = pct(thisWeekSpend, priorWeekSpend)
  const changeColor = pctColor(thisWeekSpend, priorWeekSpend)

  const providerRows = byProvider
    .sort((a, b) => b.spend - a.spend)
    .map(
      (row) => `
      <tr>
        <td style="padding:10px 16px;font-size:12px;color:#71717a;border-bottom:1px solid #f4f4f5">${providerLabel[row.provider] ?? row.provider}</td>
        <td align="right" style="padding:10px 16px;font-family:monospace;font-size:13px;font-weight:600;color:#18181b;border-bottom:1px solid #f4f4f5">$${fmt(row.spend)}</td>
      </tr>`,
    )
    .join("")

  const modelRows = topModels
    .slice(0, 5)
    .map(
      (row, i) => `
      <tr>
        <td style="padding:10px 16px;font-size:12px;color:#71717a;border-bottom:1px solid #f4f4f5">
          <span style="font-size:10px;color:#a1a1aa;margin-right:6px">#${i + 1}</span>
          <span style="font-family:monospace">${row.model}</span>
          <span style="font-size:10px;color:#a1a1aa;margin-left:6px">${providerLabel[row.provider] ?? row.provider}</span>
        </td>
        <td align="right" style="padding:10px 16px;font-family:monospace;font-size:13px;font-weight:600;color:#18181b;border-bottom:1px solid #f4f4f5">$${fmt(row.spend)}</td>
      </tr>`,
    )
    .join("")

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#fff;border-radius:12px;border:1px solid #e4e4e7;overflow:hidden">

        <!-- Header -->
        <tr><td style="background:#18181b;padding:20px 32px">
          <span style="color:#fff;font-size:14px;font-weight:600;letter-spacing:-0.3px">Mizan</span>
          <span style="color:#71717a;font-size:12px;margin-left:8px">Weekly digest</span>
        </td></tr>

        <!-- Hero -->
        <tr><td style="padding:32px 32px 24px">
          <p style="margin:0 0 4px;font-size:13px;color:#71717a">${weekLabel}</p>
          <p style="margin:0 0 4px;font-size:32px;font-weight:700;font-family:monospace;color:#18181b;letter-spacing:-1px">$${fmt(thisWeekSpend)}</p>
          <p style="margin:0;font-size:12px">
            <span style="color:${changeColor};font-weight:600">${changeStr}</span>
            <span style="color:#a1a1aa"> vs prior week ($${fmt(priorWeekSpend)})</span>
          </p>
        </td></tr>

        ${
          providerRows
            ? `<!-- By provider -->
        <tr><td style="padding:0 32px 24px">
          <p style="margin:0 0 10px;font-size:12px;font-weight:600;color:#18181b;text-transform:uppercase;letter-spacing:0.5px">By provider</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f0f0f0;border-radius:8px;overflow:hidden">
            ${providerRows}
          </table>
        </td></tr>`
            : ""
        }

        ${
          modelRows
            ? `<!-- Top models -->
        <tr><td style="padding:0 32px 24px">
          <p style="margin:0 0 10px;font-size:12px;font-weight:600;color:#18181b;text-transform:uppercase;letter-spacing:0.5px">Top models</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f0f0f0;border-radius:8px;overflow:hidden">
            ${modelRows}
          </table>
        </td></tr>`
            : ""
        }

        <!-- CTA -->
        <tr><td style="padding:0 32px 32px">
          <a href="${appUrl}/overview" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:500">Open dashboard &#8594;</a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 32px;border-top:1px solid #f4f4f5">
          <p style="margin:0;font-size:11px;color:#a1a1aa">
            You&#39;re receiving this weekly digest from Mizan.
            <a href="${appUrl}/notifications" style="color:#71717a;text-decoration:underline">Manage notifications</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export async function sendWeeklyDigest(userId: string) {
  const settings = await prisma.userSettings.findUnique({ where: { clerkUserId: userId } })
  if (!settings?.weeklyDigest) return

  // Resolve user email and org memberships
  let email: string | undefined
  let orgIds: string[] = []
  try {
    const clerk = await clerkClient()
    const [user, memberships] = await Promise.all([
      clerk.users.getUser(userId),
      clerk.users.getOrganizationMembershipList({ userId }),
    ])
    email = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress
    orgIds = memberships.data.map((m) => m.organization.id)
  } catch {
    return
  }
  if (!email) return

  const allOwnerIds = [userId, ...orgIds]

  const now = new Date()
  // Report the last *completed* Mon–Sun week, not the current partial week
  const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 })
  const lastWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 })
  const priorWeekStart = subWeeks(lastWeekStart, 1)
  const priorWeekEnd = endOfWeek(priorWeekStart, { weekStartsOn: 1 })

  const filterProviders =
    settings.weeklyDigestProviders && settings.weeklyDigestProviders.length > 0
      ? settings.weeklyDigestProviders.split(",").filter(Boolean)
      : null

  const providerFilter = filterProviders
    ? { provider: { in: filterProviders as ("openai" | "anthropic" | "gemini" | "bedrock" | "groq" | "mistral" | "grok" | "openrouter" | "litellm")[] } }
    : {}

  const [thisWeekRecords, priorWeekRecords] = await Promise.all([
    prisma.usageRecord.findMany({
      where: { ownerId: { in: allOwnerIds }, date: { gte: lastWeekStart, lte: lastWeekEnd }, ...providerFilter },
      select: { costUsd: true, provider: true, model: true },
    }),
    prisma.usageRecord.findMany({
      where: {
        ownerId: { in: allOwnerIds },
        date: { gte: priorWeekStart, lte: priorWeekEnd },
        ...providerFilter,
      },
      select: { costUsd: true },
    }),
  ])

  const thisWeekSpend = thisWeekRecords.reduce((s, r) => s + Number(r.costUsd), 0)
  const priorWeekSpend = priorWeekRecords.reduce((s, r) => s + Number(r.costUsd), 0)

  // Group by provider
  const byProviderMap = new Map<string, number>()
  for (const r of thisWeekRecords) {
    byProviderMap.set(r.provider, (byProviderMap.get(r.provider) ?? 0) + Number(r.costUsd))
  }
  const byProvider = Array.from(byProviderMap.entries()).map(([provider, spend]) => ({ provider, spend }))

  // Group by model
  const byModelMap = new Map<string, { provider: string; spend: number }>()
  for (const r of thisWeekRecords) {
    const cur = byModelMap.get(r.model) ?? { provider: r.provider, spend: 0 }
    cur.spend += Number(r.costUsd)
    byModelMap.set(r.model, cur)
  }
  const topModels = Array.from(byModelMap.entries())
    .map(([model, v]) => ({ model, ...v }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 5)

  if (thisWeekSpend === 0 && priorWeekSpend === 0) return // nothing to report

  const weekLabel = `Week of ${lastWeekStart.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://mizan.app"

  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "Mizan <onboarding@resend.dev>",
    to: email,
    subject: `Your weekly AI spend: $${fmt(thisWeekSpend)} (${pct(thisWeekSpend, priorWeekSpend)} vs last week)`,
    html: buildDigestHtml({ thisWeekSpend, priorWeekSpend, byProvider, topModels, appUrl, weekLabel }),
  })
}
