import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface StatCardProps {
  label: string
  value: string
  sub?: string
  subPositive?: boolean
  className?: string
}

export function StatCard({ label, value, sub, subPositive, className }: StatCardProps) {
  return (
    <Card
      className={cn(
        "rounded-xl border-zinc-100 bg-white shadow-none",
        "transition-shadow duration-200 hover:shadow-sm",
        className
      )}
    >
      <CardContent className="p-5">
        <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">{label}</p>
        <p className="mt-2.5 font-mono text-2xl font-semibold tracking-tight text-zinc-900 tabular-nums">
          {value}
        </p>
        {sub && (
          <p className={cn("mt-1.5 text-xs", subPositive ? "text-emerald-600" : "text-zinc-400")}>
            {sub}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
