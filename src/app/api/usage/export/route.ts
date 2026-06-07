import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"
import { subDays, format } from "date-fns"

const VALID_RANGES = [7, 30, 90]
const VALID_PROVIDERS = ["openai", "anthropic", "gemini", "bedrock"]

export async function GET(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ownerId = orgId ?? userId
  const { searchParams } = req.nextUrl

  const rangeParam = Number(searchParams.get("range"))
  const providerParam = searchParams.get("provider") ?? "all"
  const days = VALID_RANGES.includes(rangeParam) ? rangeParam : 30
  const providerFilter = VALID_PROVIDERS.includes(providerParam) ? providerParam : "all"

  const fromDate = subDays(new Date(), days)

  const records = await prisma.usageRecord.groupBy({
    by: ["date", "model", "provider"],
    where: {
      ownerId,
      date: { gte: fromDate },
      ...(providerFilter !== "all" ? { provider: providerFilter } : {}),
    },
    _sum: { costUsd: true, inputTokens: true, outputTokens: true },
    orderBy: [{ date: "desc" }],
  })

  const header = "date,provider,model,input_tokens,output_tokens,cost_usd"
  const rows = records.map((r) =>
    [
      format(r.date, "yyyy-MM-dd"),
      r.provider,
      `"${r.model.replace(/"/g, '""')}"`,
      String(Number(r._sum.inputTokens ?? 0)),
      String(Number(r._sum.outputTokens ?? 0)),
      Number(r._sum.costUsd ?? 0).toFixed(6),
    ].join(",")
  )

  const csv = [header, ...rows].join("\n")
  const filename = `mizan-usage-${format(new Date(), "yyyy-MM-dd")}.csv`

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
