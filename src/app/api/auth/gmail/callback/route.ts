import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { after } from "next/server"
import { exchangeCode, getGmailProfile } from "@/lib/gmail"
import { encrypt } from "@/lib/encrypt"
import { prisma } from "@/lib/prisma"
import { scanEmails } from "@/lib/scan-emails"

export async function GET(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.redirect(new URL("/sign-in", req.url))

  const { searchParams, origin } = req.nextUrl
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  if (error || !code || !state) {
    return NextResponse.redirect(new URL("/receipts?error=oauth_denied", req.url))
  }

  try {
    const stateData = JSON.parse(Buffer.from(state, "base64url").toString("utf-8")) as {
      userId: string
      orgId: string | null
    }
    if (stateData.userId !== userId) {
      return NextResponse.redirect(new URL("/receipts?error=state_mismatch", req.url))
    }
  } catch {
    return NextResponse.redirect(new URL("/receipts?error=invalid_state", req.url))
  }

  try {
    const tokens = await exchangeCode(code, origin)
    const profile = await getGmailProfile(tokens.accessToken)

    const ownerId = orgId ?? userId
    const ownerType: "user" | "org" = orgId ? "org" : "user"

    const connection = await prisma.emailConnection.upsert({
      where: {
        emailAddress_ownerId: { emailAddress: profile.emailAddress, ownerId },
      },
      update: {
        encCredentials: encrypt(JSON.stringify(tokens)),
        status: "active",
      },
      create: {
        ownerId,
        ownerType,
        emailProvider: "gmail",
        emailAddress: profile.emailAddress,
        encCredentials: encrypt(JSON.stringify(tokens)),
      },
    })

    after(async () => {
      await scanEmails(connection.id)
    })

    return NextResponse.redirect(new URL("/receipts", req.url))
  } catch (err) {
    console.error("[gmail/callback]", err)
    return NextResponse.redirect(new URL("/receipts?error=connection_failed", req.url))
  }
}
