import { Card, CardContent, CardHeader } from "@/components/ui/card"

function SkeletonRow() {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-50 last:border-0">
      <div className="space-y-1.5">
        <div className="h-3.5 w-32 rounded bg-zinc-100 animate-pulse" />
        <div className="h-3 w-48 rounded bg-zinc-100 animate-pulse" />
      </div>
      <div className="h-5 w-16 rounded bg-zinc-100 animate-pulse" />
    </div>
  )
}

export default function AlertsLoading() {
  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <div className="mb-8 flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-7 w-28 rounded-lg bg-zinc-100 animate-pulse" />
          <div className="h-4 w-56 rounded bg-zinc-100 animate-pulse" />
        </div>
        <div className="h-8 w-32 rounded-lg bg-zinc-100 animate-pulse" />
      </div>

      <div className="space-y-6">
        <Card className="rounded-xl border-zinc-100 shadow-none">
          <CardHeader className="px-5 pt-5 pb-3">
            <div className="h-4 w-28 rounded bg-zinc-100 animate-pulse" />
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {[...Array(2)].map((_, i) => <SkeletonRow key={i} />)}
          </CardContent>
        </Card>

        <Card className="rounded-xl border-zinc-100 shadow-none">
          <CardHeader className="px-5 pt-5 pb-3">
            <div className="h-4 w-32 rounded bg-zinc-100 animate-pulse" />
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {[...Array(3)].map((_, i) => <SkeletonRow key={i} />)}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
