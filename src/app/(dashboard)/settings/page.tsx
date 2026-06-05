import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { BackfillMonthsForm } from "@/components/settings/backfill-months-form"

export default async function SettingsPage() {
  const { userId, orgId } = await auth()

  let backfillMonths = 3

  if (orgId) {
    const orgSettings = await prisma.orgSettings.findUnique({ where: { clerkOrgId: orgId } })
    backfillMonths = orgSettings?.backfillMonths ?? 3
  } else if (userId) {
    const userSettings = await prisma.userSettings.findUnique({ where: { clerkUserId: userId } })
    backfillMonths = userSettings?.backfillMonths ?? 3
  }

  return (
    <div className="mx-auto max-w-2xl px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Settings</h1>
        <p className="mt-1 text-sm text-zinc-500">Manage your preferences.</p>
      </div>

      <div className="space-y-4">
        <Card className="rounded-xl border-zinc-100 shadow-none">
          <CardHeader className="px-5 pb-2 pt-5">
            <p className="text-sm font-medium text-zinc-900">Data sync</p>
            <p className="text-xs text-zinc-500">
              Control how far back Mizan fetches data when you connect a new provider.
            </p>
          </CardHeader>
          <Separator className="bg-zinc-100" />
          <CardContent className="px-5 py-4">
            <BackfillMonthsForm
              defaultMonths={backfillMonths}
              ownerType={orgId ? "org" : "user"}
              ownerId={orgId ?? userId!}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
