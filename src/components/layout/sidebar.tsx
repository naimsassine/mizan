"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, BarChart2, Plug, Bell, Settings, Scale } from "lucide-react"
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/overview", icon: LayoutDashboard, label: "Overview" },
  { href: "/usage", icon: BarChart2, label: "Usage" },
  { href: "/connections", icon: Plug, label: "Connections" },
  { href: "/alerts", icon: Bell, label: "Alerts" },
]

const bottomItems = [
  { href: "/settings", icon: Settings, label: "Settings" },
]

export function Sidebar() {
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
                      "flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-200",
                      isActive
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

        <div className="w-full px-1.5">
          <OrganizationSwitcher
            hidePersonal
            appearance={{
              elements: {
                rootBox: "w-full",
                organizationSwitcherTrigger:
                  "w-full h-8 rounded-lg px-2 text-xs text-zinc-500 hover:bg-zinc-50 justify-start gap-1.5 truncate transition-colors duration-200",
              },
            }}
          />
        </div>
      </div>
    </aside>
  )
}
