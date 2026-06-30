import { NextRequest, NextResponse } from "next/server"
import { getOwner } from "@/lib/owner"
import { getDayBreakdown } from "@/lib/day-breakdown"

// Day-detail drill-down: GET /api/usage/day?date=YYYY-MM-DD
// Returns the breakdown of a single day's spend for the current owner (API records, receipts,
// projected subscriptions). Owner is resolved server-side, so a client can never query another's.
export async function GET(req: NextRequest) {
  const { userId, orgId } = await getOwner()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ownerId = orgId ?? userId
  const date = req.nextUrl.searchParams.get("date")
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid or missing date (expected YYYY-MM-DD)" }, { status: 400 })
  }

  const breakdown = await getDayBreakdown(ownerId, date)
  return NextResponse.json(breakdown)
}
