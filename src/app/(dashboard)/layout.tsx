import { unstable_cache } from "next/cache"
import { prisma } from "@/lib/prisma"
import { getOwner } from "@/lib/owner"
import { Sidebar } from "@/components/layout/sidebar"
import { MobileNav } from "@/components/layout/mobile-nav"
import { TopBar } from "@/components/layout/top-bar"
import { CommandPalette } from "@/components/layout/command-palette"
import { DemoBanner } from "@/components/demo/demo-banner"
import { ownerAlertsTag } from "@/lib/cache"

// Dashboard pages are always per-request (they read live per-owner data). In production Clerk's
// auth() already forces dynamic rendering; in demo mode getOwner() reads no request headers, so we
// pin dynamic rendering here to keep these pages from being prerendered at build (which would run
// DB queries against build-time data). Applies to every route under (dashboard).
export const dynamic = "force-dynamic"

// The unacknowledged-alert count powers the sidebar badge and is read on every dashboard render.
// Cache it per owner (tag-invalidated when alerts are created/acknowledged) so navigation never
// blocks on a DB round-trip just to draw a dot.
function getUnackAlerts(ownerId: string) {
  return unstable_cache(
    () =>
      prisma.alert.count({
        where: { budgetRule: { ownerId }, acknowledgedAt: null },
      }),
    ["unack-alerts", ownerId],
    { tags: [ownerAlertsTag(ownerId)], revalidate: 60 },
  )()
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { ownerId, isDemo } = await getOwner()
  const unackAlerts = ownerId ? await getUnackAlerts(ownerId) : 0

  return (
    <div className="flex h-full flex-col">
      {isDemo && <DemoBanner />}
      <div className="flex min-h-0 flex-1">
        {/* Desktop sidebar — hidden on mobile */}
        <Sidebar unackAlerts={unackAlerts} />

        {/* Mobile top bar + drawer — hidden on md+ */}
        <MobileNav unackAlerts={unackAlerts} />

        {/* Desktop top bar — hidden on mobile */}
        <TopBar />

        {/* Cmd+K command palette */}
        <CommandPalette />

        <main className="flex-1 md:pl-14 pt-14 md:pt-0 overflow-auto bg-zinc-50/60 dark:bg-zinc-950">
          {children}
        </main>
      </div>
    </div>
  )
}
