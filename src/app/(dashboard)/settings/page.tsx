import { getOwner } from "@/lib/owner"
import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { BackfillMonthsForm } from "@/components/settings/backfill-months-form"
import { NotificationToggle } from "@/components/settings/notification-toggle"
import { ThemeSetting } from "@/components/settings/theme-setting"
import { Info } from "lucide-react"

const PROVIDER_HISTORY_LIMITS: Record<string, string> = {
  OpenAI: "up to 12 months",
  Anthropic: "up to 3 months",
  "Google Gemini / Vertex AI": "up to 6 months via Cloud Monitoring",
  "AWS Bedrock": "up to 12 months via Cost Explorer",
  Groq: "up to 1 month (Enterprise Prometheus)",
  "Mistral AI": "up to 3 months",
  "xAI / Grok": "up to 3 months",
  OpenRouter: "up to 3 months",
  LiteLLM: "limited by your proxy's log retention",
}

export default async function SettingsPage() {
  const { userId, orgId } = await getOwner()

  let backfillMonths = 3
  let notificationEmail = true

  if (orgId) {
    const orgSettings = await prisma.orgSettings.findUnique({ where: { clerkOrgId: orgId } })
    backfillMonths = orgSettings?.backfillMonths ?? 3
  } else if (userId) {
    const userSettings = await prisma.userSettings.findUnique({ where: { clerkUserId: userId } })
    backfillMonths = userSettings?.backfillMonths ?? 3
    notificationEmail = userSettings?.notificationEmail ?? true
  }

  return (
    <div className="mx-auto max-w-2xl px-4 md:px-8 py-6 md:py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Settings</h1>
        <p className="mt-1 text-sm text-zinc-500">Manage your preferences and sync configuration.</p>
      </div>

      <div className="space-y-4">
        <Card className="rounded-xl border-zinc-100 shadow-none">
          <CardHeader className="px-5 pb-2 pt-5">
            <p className="text-sm font-medium text-zinc-900">Data sync</p>
            <p className="text-xs text-zinc-500">
              Control how far back Mizan fetches usage data when you connect a new provider.
            </p>
          </CardHeader>
          <Separator className="bg-zinc-100" />
          <CardContent className="px-5 py-4 space-y-4">
            <BackfillMonthsForm
              defaultMonths={backfillMonths}
              ownerType={orgId ? "org" : "user"}
              ownerId={orgId ?? userId!}
            />
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-3">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" strokeWidth={1.5} />
                <div>
                  <p className="text-xs font-medium text-zinc-600">Provider history limits</p>
                  <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                    Each provider has a maximum lookback window. Setting a higher backfill value
                    won&apos;t exceed what the provider supports.
                  </p>
                  <ul className="mt-2 space-y-0.5">
                    {Object.entries(PROVIDER_HISTORY_LIMITS).map(([provider, limit]) => (
                      <li key={provider} className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                        <span className="font-medium text-zinc-600">{provider}:</span> {limit}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {!orgId && userId && (
          <Card className="rounded-xl border-zinc-100 shadow-none">
            <CardHeader className="px-5 pb-2 pt-5">
              <p className="text-sm font-medium text-zinc-900">Notifications</p>
              <p className="text-xs text-zinc-500">
                Choose how you want to be notified when budget alerts fire.
              </p>
            </CardHeader>
            <Separator className="bg-zinc-100" />
            <CardContent className="px-5 py-4">
              <NotificationToggle defaultEnabled={notificationEmail} ownerId={userId} />
            </CardContent>
          </Card>
        )}

        <Card className="rounded-xl border-zinc-100 shadow-none">
          <CardHeader className="px-5 pb-2 pt-5">
            <p className="text-sm font-medium text-zinc-900">Appearance</p>
            <p className="text-xs text-zinc-500">
              Switch between light, dark, and system themes.
            </p>
          </CardHeader>
          <Separator className="bg-zinc-100" />
          <CardContent className="px-5 py-4">
            <ThemeSetting />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
