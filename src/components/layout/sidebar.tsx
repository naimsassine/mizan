"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, BarChart2, Plug, Bell, Settings, Scale, Receipt } from "lucide-react"
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs"
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
    <aside className="group/sidebar fixed inset-y-0 left-0 z-20 hidden md:flex w-14 hover:w-52 shrink-0 flex-col border-r border-zinc-100 bg-white transition-[width] duration-200 overflow-hidden">
      {/* Logo */}
      <div className="flex h-14 shrink-0 items-center border-b border-zinc-100 px-3.5">
        <Link
          href="/overview"
          className="flex items-center gap-3 rounded-lg p-1 text-zinc-900 hover:bg-zinc-100 transition-all duration-200"
        >
          <Scale className="h-5 w-5 shrink-0" strokeWidth={1.5} />
          <span className="text-sm font-semibold tracking-tight opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-100 delay-75 whitespace-nowrap">
            Mizan
          </span>
        </Link>
      </div>

      {/* Nav items */}
      <nav className="flex flex-1 flex-col gap-0.5 px-2 py-3">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/")
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={cn(
                "relative flex h-9 items-center gap-3 rounded-lg px-2.5 transition-all duration-200",
                isActive
                  ? "bg-zinc-900 text-white shadow-sm"
                  : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
              <span className="text-sm font-medium opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-100 delay-75 whitespace-nowrap truncate">
                {label}
              </span>
              {href === "/notifications" && unackAlerts > 0 && (
                <span className="absolute right-2 top-2 flex h-2 w-2 rounded-full bg-red-500 group-hover/sidebar:right-3" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Bottom items */}
      <div className="flex flex-col gap-0.5 border-t border-zinc-100 px-2 py-3">
        {bottomItems.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            title={label}
            className={cn(
              "flex h-9 items-center gap-3 rounded-lg px-2.5 transition-all duration-200",
              pathname === href
                ? "bg-zinc-900 text-white shadow-sm"
                : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            <span className="text-sm font-medium opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-100 delay-75 whitespace-nowrap truncate">
              {label}
            </span>
          </Link>
        ))}

        <div className="flex h-9 items-center gap-3 px-2.5">
          <div className="shrink-0">
            <OrganizationSwitcher
              hidePersonal
              appearance={{
                elements: {
                  rootBox: "flex items-center",
                  organizationSwitcherTrigger:
                    "flex items-center justify-center rounded-lg p-0 hover:bg-zinc-100 transition-colors duration-200",
                  organizationPreviewTextContainer: "hidden",
                  organizationSwitcherTriggerIcon: "hidden",
                  avatarBox: "h-6 w-6",
                },
              }}
            />
          </div>
          <span className="text-xs text-zinc-400 opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-100 delay-75 whitespace-nowrap truncate">
            Switch org
          </span>
        </div>

        <div className="flex h-9 items-center gap-3 px-2.5">
          <div className="shrink-0">
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "h-6 w-6",
                },
              }}
            />
          </div>
          <span className="text-xs text-zinc-400 opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-100 delay-75 whitespace-nowrap truncate">
            Account
          </span>
        </div>
      </div>
    </aside>
  )
}
