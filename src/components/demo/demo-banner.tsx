import { FlaskConical, ArrowUpRight } from "lucide-react"
import { REAL_APP_URL } from "@/lib/demo"

// Thin top-of-dashboard banner shown only in demo mode (rendered conditionally by the dashboard
// layout). Kept deliberately subtle — it blends into the page background rather than calling
// attention to itself. The right side links to the real production app when REAL_APP_URL is set.
export function DemoBanner() {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-zinc-100 bg-zinc-50 px-4 py-1.5 text-[11px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
      <div className="flex min-w-0 items-center gap-1.5">
        <FlaskConical className="h-3 w-3 shrink-0" strokeWidth={1.5} />
        <span className="truncate">Demo mode — sample data. Editing is disabled.</span>
      </div>
      {REAL_APP_URL && (
        <a
          href={REAL_APP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
        >
          Access the real deal
          <ArrowUpRight className="h-3 w-3" />
        </a>
      )}
    </div>
  )
}
