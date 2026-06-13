import { auth } from "@clerk/nextjs/server"
import { unstable_cache } from "next/cache"
import { prisma } from "@/lib/prisma"
import { Sidebar } from "@/components/layout/sidebar"
import { MobileNav } from "@/components/layout/mobile-nav"
import { TopBar } from "@/components/layout/top-bar"
import { CommandPalette } from "@/components/layout/command-palette"
import { ownerAlertsTag } from "@/lib/cache"

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
  const { userId, orgId } = await auth()
  const ownerId = orgId ?? userId
  const unackAlerts = ownerId ? await getUnackAlerts(ownerId) : 0

  return (
    <div className="flex h-full">
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
  )
}
