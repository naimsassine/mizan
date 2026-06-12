import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"
import { Sidebar } from "@/components/layout/sidebar"
import { MobileNav } from "@/components/layout/mobile-nav"
import { TopBar } from "@/components/layout/top-bar"
import { CommandPalette } from "@/components/layout/command-palette"

export const dynamic = "force-dynamic"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId, orgId } = await auth()
  const ownerId = orgId ?? userId
  let unackAlerts = 0
  if (ownerId) {
    unackAlerts = await prisma.alert.count({
      where: { budgetRule: { ownerId }, acknowledgedAt: null },
    })
  }

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
