"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  LayoutDashboard,
  BarChart2,
  ArrowLeftRight,
  Plug,
  Bell,
  Settings,
  Sun,
  Moon,
  Search,
  type LucideIcon,
} from "lucide-react"

interface Command {
  id: string
  label: string
  hint?: string
  icon: LucideIcon
  keywords?: string
  run: (ctx: { router: ReturnType<typeof useRouter>; setTheme: (t: string) => void; resolvedTheme?: string }) => void
}

const NAV: Command[] = [
  { id: "overview", label: "Go to Overview", icon: LayoutDashboard, keywords: "dashboard home", run: ({ router }) => router.push("/overview") },
  { id: "usage", label: "Go to Usage", icon: BarChart2, keywords: "tokens table export", run: ({ router }) => router.push("/usage") },
  { id: "compare", label: "Go to Compare", icon: ArrowLeftRight, keywords: "cost per million pricing", run: ({ router }) => router.push("/compare") },
  { id: "connections", label: "Go to Connections", icon: Plug, keywords: "providers api keys subscriptions receipts invoices email upload spend", run: ({ router }) => router.push("/connections") },
  { id: "notifications", label: "Go to Notifications", icon: Bell, keywords: "alerts budgets rules", run: ({ router }) => router.push("/notifications") },
  { id: "settings", label: "Go to Settings", icon: Settings, keywords: "preferences backfill", run: ({ router }) => router.push("/settings") },
]

export function CommandPalette() {
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const commands = useMemo<Command[]>(
    () => [
      ...NAV,
      {
        id: "toggle-theme",
        label: resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme",
        icon: resolvedTheme === "dark" ? Sun : Moon,
        keywords: "dark light mode appearance",
        run: ({ setTheme, resolvedTheme }) => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
      },
    ],
    [resolvedTheme],
  )

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || (c.keywords ?? "").includes(q),
    )
  }, [query, commands])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (e.key === "Escape") {
        setOpen(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    if (open) {
      setQuery("")
      setActive(0)
      // Focus after the dialog paints
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  if (!open) return null

  function runAt(index: number) {
    const cmd = results[index]
    if (!cmd) return
    setOpen(false)
    cmd.run({ router, setTheme, resolvedTheme })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 backdrop-blur-sm pt-[15vh]"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-zinc-100 px-4 dark:border-zinc-800">
          <Search className="h-4 w-4 shrink-0 text-zinc-400" strokeWidth={1.5} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault()
                setActive((a) => Math.min(a + 1, results.length - 1))
              } else if (e.key === "ArrowUp") {
                e.preventDefault()
                setActive((a) => Math.max(a - 1, 0))
              } else if (e.key === "Enter") {
                e.preventDefault()
                runAt(active)
              }
            }}
            placeholder="Search pages and actions…"
            className="h-12 w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
          />
        </div>
        <ul className="max-h-72 overflow-y-auto p-1.5">
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-xs text-zinc-400">No results</li>
          )}
          {results.map((cmd, i) => {
            const Icon = cmd.icon
            return (
              <li key={cmd.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => runAt(i)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    i === active
                      ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                      : "text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0 text-zinc-400" strokeWidth={1.5} />
                  {cmd.label}
                </button>
              </li>
            )
          })}
        </ul>
        <div className="flex items-center justify-between border-t border-zinc-100 px-3 py-2 text-[10px] text-zinc-400 dark:border-zinc-800">
          <span>↑↓ to navigate · ↵ to select</span>
          <span>esc to close</span>
        </div>
      </div>
    </div>
  )
}
