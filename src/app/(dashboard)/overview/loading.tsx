import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

export default function OverviewLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 md:px-8 py-6 md:py-8">
      <div className="mb-8">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="mt-2 h-4 w-48" />
      </div>

      <div className="space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="rounded-xl border-zinc-100 shadow-none">
              <CardContent className="p-5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-2.5 h-7 w-28" />
                <Skeleton className="mt-1.5 h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Chart */}
        <Card className="rounded-xl border-zinc-100 shadow-none">
          <CardHeader className="px-5 pb-2 pt-5">
            <Skeleton className="h-4 w-40" />
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <Skeleton className="h-[200px] w-full" />
          </CardContent>
        </Card>

        {/* Model breakdown */}
        <Card className="rounded-xl border-zinc-100 shadow-none">
          <CardHeader className="px-5 pb-3 pt-5">
            <Skeleton className="h-4 w-16" />
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="flex-1">
                    <Skeleton className="mb-1.5 h-3 w-40" />
                    <Skeleton className="h-1.5 w-full" />
                  </div>
                  <div className="shrink-0 space-y-1 text-right">
                    <Skeleton className="ml-auto h-3 w-12" />
                    <Skeleton className="ml-auto h-2.5 w-8" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
