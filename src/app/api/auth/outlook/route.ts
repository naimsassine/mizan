import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "node:crypto"
import { buildOAuthUrl } from "@/lib/outlook"

export async function GET(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.redirect(new URL("/sign-in", req.url))

  const nonce = randomBytes(16).toString("hex")
  const state = Buffer.from(JSON.stringify({ userId, orgId, nonce })).toString("base64url")
  const url = buildOAuthUrl(state, req.nextUrl.origin)

  const response = NextResponse.redirect(url)
  response.cookies.set("oauth_nonce", nonce, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/" })
  return response
}
