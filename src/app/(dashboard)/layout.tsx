import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"
import { Sidebar } from "@/components/layout/sidebar"

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
      <Sidebar unackAlerts={unackAlerts} />
      <main className="flex-1 pl-14 overflow-auto bg-zinc-50/60">
        {children}
      </main>
    </div>
  )
}
