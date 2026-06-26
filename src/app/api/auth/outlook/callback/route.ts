import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { after } from "next/server"
import { exchangeCode, getOutlookProfile } from "@/lib/outlook"
import { encrypt } from "@/lib/encrypt"
import { prisma } from "@/lib/prisma"
import { scanEmails } from "@/lib/scan-emails"
import { IS_DEMO } from "@/lib/demo"

export async function GET(req: NextRequest) {
  if (IS_DEMO) return NextResponse.redirect(new URL("/connections", req.url))

  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.redirect(new URL("/sign-in", req.url))

  const { searchParams, origin } = req.nextUrl
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  if (error || !code || !state) {
    return NextResponse.redirect(new URL("/connections?error=oauth_denied", req.url))
  }

  let stateOrgId: string | null = null
  try {
    const stateData = JSON.parse(Buffer.from(state, "base64url").toString("utf-8")) as {
      userId: string
      orgId: string | null
      nonce?: string
    }
    const storedNonce = req.cookies.get("oauth_nonce")?.value
    if (stateData.userId !== userId || (stateData.nonce && stateData.nonce !== storedNonce)) {
      return NextResponse.redirect(new URL("/connections?error=state_mismatch", req.url))
    }
    stateOrgId = stateData.orgId
  } catch {
    return NextResponse.redirect(new URL("/connections?error=invalid_state", req.url))
  }

  try {
    const tokens = await exchangeCode(code, origin)
    const profile = await getOutlookProfile(tokens.accessToken)

    const ownerId = stateOrgId ?? userId
    const ownerType: "user" | "org" = stateOrgId ? "org" : "user"

    const connection = await prisma.emailConnection.upsert({
      where: {
        emailAddress_ownerId: { emailAddress: profile.emailAddress, ownerId },
      },
      update: {
        encCredentials: encrypt(JSON.stringify(tokens)),
        status: "active",
        emailProvider: "outlook",
      },
      create: {
        ownerId,
        ownerType,
        emailProvider: "outlook",
        emailAddress: profile.emailAddress,
        encCredentials: encrypt(JSON.stringify(tokens)),
      },
    })

    after(async () => {
      await scanEmails(connection.id)
    })

    const response = NextResponse.redirect(new URL("/connections", req.url))
    response.cookies.delete("oauth_nonce")
    return response
  } catch (err) {
    console.error("[outlook/callback]", err)
    return NextResponse.redirect(new URL("/connections?error=connection_failed", req.url))
  }
}
