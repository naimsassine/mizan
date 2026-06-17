import { FlaskConical } from "lucide-react"

// Thin top-of-dashboard banner shown only in demo mode (rendered conditionally by the dashboard
// layout). Communicates that the data is sample data and that changes are disabled.
export function DemoBanner() {
  return (
    <div className="flex items-center justify-center gap-2 border-b border-amber-100 bg-amber-50 px-4 py-1.5 text-center text-[11px] font-medium text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-300">
      <FlaskConical className="h-3 w-3 shrink-0" strokeWidth={1.5} />
      <span>
        Demo mode — sample data, no sign-in. Browsing is fully enabled; connecting providers and
        edits are turned off.
      </span>
    </div>
  )
}
