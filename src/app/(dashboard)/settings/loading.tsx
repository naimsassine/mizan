import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-2xl px-8 py-8">
      <div className="mb-8">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="mt-2 h-4 w-44" />
      </div>

      <Card className="rounded-xl border-zinc-100 shadow-none">
        <CardHeader className="px-5 pb-2 pt-5">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="mt-1.5 h-3 w-72" />
        </CardHeader>
        <Separator className="bg-zinc-100" />
        <CardContent className="px-5 py-4">
          <Skeleton className="h-9 w-32 rounded-lg" />
        </CardContent>
      </Card>
    </div>
  )
}
