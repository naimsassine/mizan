"use client"

import { OrganizationSwitcher, UserButton } from "@clerk/nextjs"

export function TopBar() {
  return (
    <div className="fixed top-3 right-4 z-10 hidden md:flex items-center gap-2">
      <OrganizationSwitcher
        appearance={{
          elements: {
            rootBox: "flex items-center overflow-visible",
            organizationSwitcherTrigger:
              "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors",
            organizationPreviewTextContainer: "text-sm",
            organizationSwitcherTriggerIcon: "text-zinc-400",
            avatarBox: "h-5 w-5",
          },
        }}
      />
      <UserButton
        appearance={{
          elements: {
            avatarBox: "h-7 w-7",
          },
        }}
      />
    </div>
  )
}
