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
    <Card className={cn("rounded-xl border-zinc-100 shadow-none", className)}>
      <CardContent className="p-5">
        <p className="text-xs text-zinc-500">{label}</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">{value}</p>
        {sub && (
          <p className={cn("mt-1 text-xs", subPositive ? "text-emerald-600" : "text-zinc-400")}>
            {sub}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
