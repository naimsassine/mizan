"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  BarChart2,
  Plug,
  Bell,
  Settings,
  Scale,
  Receipt,
  Menu,
  X,
  ArrowLeftRight,
} from "lucide-react"
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/overview", icon: LayoutDashboard, label: "Overview" },
  { href: "/usage", icon: BarChart2, label: "Usage" },
  { href: "/compare", icon: ArrowLeftRight, label: "Compare" },
  { href: "/connections", icon: Plug, label: "Connections" },
  { href: "/receipts", icon: Receipt, label: "Receipts" },
  { href: "/notifications", icon: Bell, label: "Notifications" },
  { href: "/settings", icon: Settings, label: "Settings" },
]

export function MobileNav({ unackAlerts = 0 }: { unackAlerts?: number }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  return (
    <>
      {/* Top bar — mobile only */}
      <header className="fixed inset-x-0 top-0 z-20 flex h-14 items-center justify-between border-b border-zinc-100 bg-white px-4 md:hidden">
        <button
          onClick={() => setOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100 transition-colors"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" strokeWidth={1.5} />
        </button>

        <Link href="/overview" className="flex items-center gap-2 text-zinc-900">
          <Scale className="h-5 w-5" strokeWidth={1.5} />
          <span className="text-sm font-semibold tracking-tight">Mizan</span>
        </Link>

        <div className="flex items-center gap-2">
          {unackAlerts > 0 && (
            <Link href="/notifications">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                {unackAlerts > 9 ? "9+" : unackAlerts}
              </span>
            </Link>
          )}
          <UserButton appearance={{ elements: { avatarBox: "h-7 w-7" } }} />
        </div>
      </header>

      {/* Drawer overlay */}
      {open && (
        <div className="fixed inset-0 z-30 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Drawer panel */}
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-xl">
            {/* Drawer header */}
            <div className="flex h-14 items-center justify-between border-b border-zinc-100 px-4">
              <Link
                href="/overview"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 text-zinc-900"
              >
                <Scale className="h-5 w-5" strokeWidth={1.5} />
                <span className="text-sm font-semibold tracking-tight">Mizan</span>
              </Link>
              <button
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Nav items */}
            <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4">
              {navItems.map(({ href, icon: Icon, label }) => {
                const isActive = pathname === href || pathname.startsWith(href + "/")
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "relative flex h-10 items-center gap-3 rounded-lg px-3 transition-colors duration-150",
                      isActive
                        ? "bg-zinc-900 text-white"
                        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                    <span className="text-sm font-medium">{label}</span>
                    {href === "/notifications" && unackAlerts > 0 && (
                      <span className="ml-auto flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                        {unackAlerts > 9 ? "9+" : unackAlerts}
                      </span>
                    )}
                  </Link>
                )
              })}
            </nav>

            {/* Bottom: org switcher */}
            <div className="border-t border-zinc-100 p-4 space-y-3">
              <OrganizationSwitcher
                hidePersonal
                appearance={{
                  elements: {
                    rootBox: "w-full",
                    organizationSwitcherTrigger:
                      "w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 transition-colors",
                    organizationPreviewTextContainer: "text-sm",
                    avatarBox: "h-5 w-5",
                  },
                }}
              />
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
