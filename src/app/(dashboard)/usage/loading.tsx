import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"

export default function UsageLoading() {
  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <Skeleton className="h-8 w-24" />
          <Skeleton className="mt-2 h-4 w-52" />
        </div>
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="rounded-xl border-zinc-100 shadow-none">
            <CardContent className="p-5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2.5 h-7 w-28" />
              <Skeleton className="mt-1.5 h-3 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card className="overflow-hidden rounded-xl border-zinc-100 shadow-none">
        <div className="border-b border-zinc-100 px-5 py-3">
          <div className="flex gap-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-16" />
            ))}
          </div>
        </div>
        <div className="divide-y divide-zinc-50">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-8 px-5 py-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-4 w-16 rounded-full" />
              <Skeleton className="ml-auto h-3 w-12" />
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
