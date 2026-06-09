"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, BarChart2, Plug, Bell, Settings, Scale, Receipt } from "lucide-react"
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/overview", icon: LayoutDashboard, label: "Overview" },
  { href: "/usage", icon: BarChart2, label: "Usage" },
  { href: "/connections", icon: Plug, label: "Connections" },
  { href: "/receipts", icon: Receipt, label: "Receipts" },
  { href: "/notifications", icon: Bell, label: "Notifications" },
]

const bottomItems = [
  { href: "/settings", icon: Settings, label: "Settings" },
]

export function Sidebar({ unackAlerts = 0 }: { unackAlerts?: number }) {
  const pathname = usePathname()

  return (
    <aside className="fixed inset-y-0 left-0 z-10 flex w-14 shrink-0 flex-col border-r border-zinc-100 bg-white">
      {/* Logo */}
      <div className="flex h-14 items-center justify-center border-b border-zinc-100">
        <Link
          href="/overview"
          className="flex items-center justify-center rounded-lg p-1.5 text-zinc-900 hover:bg-zinc-100 transition-all duration-200"
        >
          <Scale className="h-5 w-5" strokeWidth={1.5} />
        </Link>
      </div>

      {/* Nav items */}
      <nav className="flex flex-1 flex-col items-center gap-1 py-4">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/")
          return (
            <Tooltip key={href}>
              <TooltipTrigger
                render={
                  <Link
                    href={href}
                    className={cn(
                      "relative flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-200",
                      isActive
                        ? "bg-zinc-900 text-white shadow-sm"
                        : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
                    )}
                  />
                }
              >
                <Icon className="h-4 w-4" strokeWidth={1.5} />
                {href === "/notifications" && unackAlerts > 0 && (
                  <span className="absolute right-1 top-1 flex h-2 w-2 rounded-full bg-red-500" />
                )}
                <span className="sr-only">{label}</span>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                {label}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </nav>

      {/* Bottom items */}
      <div className="flex flex-col items-center gap-2 border-t border-zinc-100 py-4">
        {bottomItems.map(({ href, icon: Icon, label }) => (
          <Tooltip key={href}>
            <TooltipTrigger
              render={
                <Link
                  href={href}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-200",
                    pathname === href
                      ? "bg-zinc-900 text-white shadow-sm"
                      : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
                  )}
                />
              }
            >
              <Icon className="h-4 w-4" strokeWidth={1.5} />
              <span className="sr-only">{label}</span>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {label}
            </TooltipContent>
          </Tooltip>
        ))}

        <div className="flex h-9 w-9 items-center justify-center">
          <UserButton
            appearance={{
              elements: {
                avatarBox: "h-6 w-6",
              },
            }}
          />
        </div>

        <div className="flex h-9 w-9 items-center justify-center">
          <OrganizationSwitcher
            hidePersonal
            appearance={{
              elements: {
                rootBox: "flex items-center justify-center",
                organizationSwitcherTrigger:
                  "h-9 w-9 flex items-center justify-center rounded-lg p-0 hover:bg-zinc-100 transition-colors duration-200",
                organizationPreviewTextContainer: "hidden",
                organizationSwitcherTriggerIcon: "hidden",
                avatarBox: "h-6 w-6",
              },
            }}
          />
        </div>
      </div>
    </aside>
  )
}
