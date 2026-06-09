import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { after } from "next/server"
import { encrypt } from "@/lib/encrypt"
import { prisma } from "@/lib/prisma"
import { syncGemini } from "@/lib/sync/gemini"
import { subMonths, startOfDay } from "date-fns"

const TOKEN_URL = "https://oauth2.googleapis.com/token"

async function exchangeCode(
  code: string,
  origin: string,
): Promise<{ accessToken: string; refreshToken: string; expiresAt: number }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${origin}/api/auth/gcp/callback`,
      grant_type: "authorization_code",
    }),
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`)
  const d = await res.json()
  return {
    accessToken: d.access_token,
    refreshToken: d.refresh_token,
    expiresAt: Date.now() + (d.expires_in as number) * 1000,
  }
}

async function listProjects(accessToken: string): Promise<{ projectId: string; name: string }[]> {
  const res = await fetch(
    "https://cloudresourcemanager.googleapis.com/v1/projects?filter=lifecycleState%3AACTIVE",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!res.ok) return []
  const d = await res.json()
  return ((d.projects ?? []) as { projectId: string; name: string }[]).map((p) => ({
    projectId: p.projectId,
    name: p.name,
  }))
}

export async function GET(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.redirect(new URL("/sign-in", req.url))

  const { searchParams, origin } = req.nextUrl
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  if (error || !code || !state) {
    return NextResponse.redirect(new URL("/connections?error=oauth_denied", req.url))
  }

  try {
    const stateData = JSON.parse(Buffer.from(state, "base64url").toString("utf-8")) as {
      userId: string
      orgId: string | null
    }
    if (stateData.userId !== userId) {
      return NextResponse.redirect(new URL("/connections?error=state_mismatch", req.url))
    }
  } catch {
    return NextResponse.redirect(new URL("/connections?error=invalid_state", req.url))
  }

  try {
    const tokens = await exchangeCode(code, origin)
    const projects = await listProjects(tokens.accessToken)

    // Auto-select the only project; otherwise mark as PENDING for manual config
    const projectId = projects.length === 1 ? projects[0].projectId : "PENDING"

    const ownerId = orgId ?? userId
    const ownerType: "user" | "org" = orgId ? "org" : "user"

    const backfillMonths =
      (
        await prisma.userSettings.findUnique({
          where: { clerkUserId: userId },
          select: { backfillMonths: true },
        })
      )?.backfillMonths ?? 3

    const connection = await prisma.providerConnection.create({
      data: {
        ownerId,
        ownerType,
        provider: "gemini",
        encCredentials: encrypt(JSON.stringify(tokens)),
        gcpProjectId: projectId,
        backfillFrom: startOfDay(subMonths(new Date(), backfillMonths)),
        backfillStatus: "pending",
      },
    })

    if (projectId !== "PENDING") {
      after(async () => {
        await syncGemini(connection.id)
      })
    }

    const redirect =
      projectId === "PENDING"
        ? `/connections?gcp_conn=${connection.id}`
        : "/connections"

    return NextResponse.redirect(new URL(redirect, req.url))
  } catch (err) {
    console.error("[gcp/callback]", err)
    return NextResponse.redirect(new URL("/connections?error=connection_failed", req.url))
  }
}
