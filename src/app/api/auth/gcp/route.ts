import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "node:crypto"

const GCP_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const SCOPE = [
  "https://www.googleapis.com/auth/monitoring.read",
  "https://www.googleapis.com/auth/cloud-platform.read-only",
].join(" ")

export async function GET(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.redirect(new URL("/sign-in", req.url))

  const nonce = randomBytes(16).toString("hex")
  const state = Buffer.from(JSON.stringify({ userId, orgId, nonce })).toString("base64url")
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${req.nextUrl.origin}/api/auth/gcp/callback`,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  })

  const response = NextResponse.redirect(`${GCP_AUTH_URL}?${params}`)
  response.cookies.set("oauth_nonce", nonce, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/" })
  return response
}
