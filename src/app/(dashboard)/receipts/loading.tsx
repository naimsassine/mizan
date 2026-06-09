import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

export default function ReceiptsLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 md:px-8 py-6 md:py-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <Skeleton className="h-7 w-24" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-28 rounded-lg" />
          <Skeleton className="h-8 w-32 rounded-lg" />
        </div>
      </div>

      {/* Email connections skeleton */}
      <div className="mb-6 space-y-2">
        <Skeleton className="h-3 w-44 mb-3" />
        <Card className="rounded-xl border-zinc-100 border-l-2 border-l-violet-400 shadow-none">
          <CardContent className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-4 w-4 rounded" />
              <div>
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-1 h-3 w-48" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-7 w-7 rounded-md" />
              <Skeleton className="h-7 w-7 rounded-md" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Receipts list skeleton */}
      <Card className="rounded-xl border-zinc-100 shadow-none">
        <CardHeader className="px-5 pt-5 pb-3">
          <Skeleton className="h-4 w-16" />
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="divide-y divide-zinc-50">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3.5">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-16 rounded-full" />
                    <Skeleton className="h-4 w-12 rounded-full" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <Skeleton className="h-3 w-36" />
                </div>
                <Skeleton className="h-7 w-7 rounded-md" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
