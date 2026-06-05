import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { syncOpenAIIncremental } from "@/lib/sync/openai"
import { syncAnthropicIncremental } from "@/lib/sync/anthropic"

// Called daily by Vercel cron — runs incremental sync for all active connections
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const connections = await prisma.providerConnection.findMany({
    where: { status: "active", provider: { in: ["openai", "anthropic"] } },
    select: { id: true, provider: true },
  })

  await Promise.allSettled(
    connections.map((c) => {
      if (c.provider === "anthropic") return syncAnthropicIncremental(c.id)
      return syncOpenAIIncremental(c.id)
    })
  )

  return NextResponse.json({ synced: connections.length })
}
