import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"

export default function ConnectionsLoading() {
  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <Skeleton className="h-7 w-36" />
          <Skeleton className="mt-2 h-4 w-64" />
        </div>
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>

      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="rounded-xl border-zinc-100 border-l-2 border-l-zinc-200 shadow-none">
            <CardContent className="flex items-center justify-between px-5 py-4">
              <div>
                <Skeleton className="h-4 w-28" />
                <Skeleton className="mt-1.5 h-3 w-44" />
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-7 w-7 rounded-md" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
