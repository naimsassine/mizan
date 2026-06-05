import { Sidebar } from "@/components/layout/sidebar"

export const dynamic = "force-dynamic"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 pl-14 overflow-auto bg-zinc-50/60">
        {children}
      </main>
    </div>
  )
}
