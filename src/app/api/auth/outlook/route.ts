import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { buildOAuthUrl } from "@/lib/outlook"

export async function GET(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.redirect(new URL("/sign-in", req.url))

  const state = Buffer.from(JSON.stringify({ userId, orgId })).toString("base64url")
  const url = buildOAuthUrl(state, req.nextUrl.origin)
  return NextResponse.redirect(url)
}
