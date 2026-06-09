import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

export default function NotificationsLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 md:px-8 py-6 md:py-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <Skeleton className="h-7 w-36" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>

      <div className="space-y-6">
        <Card className="rounded-xl border-zinc-100 shadow-none">
          <CardHeader className="px-5 pt-5 pb-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-1.5 h-3 w-80" />
          </CardHeader>
          <CardContent className="px-5 py-4">
            <Skeleton className="h-9 w-full rounded-lg" />
          </CardContent>
        </Card>

        <Card className="rounded-xl border-zinc-100 shadow-none">
          <CardHeader className="px-5 pt-5 pb-3">
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent className="px-0 pb-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-14 rounded-full" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-7 w-7 rounded-md" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-xl border-zinc-100 shadow-none">
          <CardHeader className="px-5 pt-5 pb-3">
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent className="px-0 pb-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3.5">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-3.5 w-36" />
                  </div>
                  <Skeleton className="h-3 w-44" />
                </div>
                <Skeleton className="h-7 w-20 rounded-md" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
