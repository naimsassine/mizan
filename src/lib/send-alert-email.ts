import { clerkClient } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"
import { getResend } from "@/lib/resend"

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

function buildEmailHtml(params: {
  spendUsd: number
  limitUsd: number
  period: string
  provider: string | null
  alertAtPct: number
  appUrl: string
}): string {
  const { spendUsd, limitUsd, period, provider, alertAtPct, appUrl } = params
  const providerText = provider ? (providerLabel[provider] ?? provider) : "all providers"
  const periodCap = period.charAt(0).toUpperCase() + period.slice(1)

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#fff;border-radius:12px;border:1px solid #e4e4e7;overflow:hidden">
        <tr><td style="background:#18181b;padding:20px 32px">
          <span style="color:#fff;font-size:14px;font-weight:600;letter-spacing:-0.3px">Mizan</span>
        </td></tr>
        <tr><td style="padding:32px">
          <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#18181b;letter-spacing:-0.3px">Budget alert</p>
          <p style="margin:0 0 24px;font-size:14px;color:#71717a;line-height:1.5">
            Your ${period} spend for <strong style="color:#18181b">${providerText}</strong> has reached ${alertAtPct}% of your $${limitUsd.toFixed(2)} limit.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-radius:8px;border:1px solid #f0f0f0;margin-bottom:24px">
            <tr>
              <td style="padding:14px 16px;font-size:12px;color:#71717a;font-weight:500;border-bottom:1px solid #f0f0f0">Current spend</td>
              <td align="right" style="padding:14px 16px;font-family:monospace;font-size:16px;font-weight:700;color:#18181b;border-bottom:1px solid #f0f0f0">$${spendUsd.toFixed(2)}</td>
            </tr>
            <tr>
              <td style="padding:14px 16px;font-size:12px;color:#71717a;font-weight:500">${periodCap} limit</td>
              <td align="right" style="padding:14px 16px;font-family:monospace;font-size:15px;font-weight:600;color:#a1a1aa">$${limitUsd.toFixed(2)}</td>
            </tr>
          </table>
          <a href="${appUrl}/notifications" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:500">View in Mizan &#8594;</a>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #f4f4f5">
          <p style="margin:0;font-size:11px;color:#a1a1aa">You&#39;re receiving this because cost alerts are enabled. <a href="${appUrl}/notifications" style="color:#71717a;text-decoration:underline">Manage notifications</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export async function sendAlertEmail({
  ownerId,
  ownerType,
  spendUsd,
  limitUsd,
  period,
  provider,
  alertAtPct,
}: {
  ownerId: string
  ownerType: string
  spendUsd: number
  limitUsd: number
  period: string
  provider: string | null
  alertAtPct: number
}) {
  // Org-level owners don't have a notificationEmail setting — skip
  if (ownerType !== "user") return

  const settings = await prisma.userSettings.findUnique({ where: { clerkUserId: ownerId } })
  if (settings?.notificationEmail === false) return

  let email: string | undefined
  try {
    const clerk = await clerkClient()
    const user = await clerk.users.getUser(ownerId)
    email = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress
  } catch {
    return
  }
  if (!email) return

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://mizan.app"
  const providerText = provider ? (providerLabel[provider] ?? provider) : "all providers"
  const subject = `Budget alert: $${spendUsd.toFixed(2)} of $${limitUsd.toFixed(2)} ${period} limit (${providerText})`

  await getResend().emails.send({
    from: process.env.EMAIL_FROM ?? "Mizan <onboarding@resend.dev>",
    to: email,
    subject,
    html: buildEmailHtml({ spendUsd, limitUsd, period, provider, alertAtPct, appUrl }),
  })
}
