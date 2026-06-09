const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1"
const SCOPE = "https://www.googleapis.com/auth/gmail.readonly"

export interface GmailTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

export function buildOAuthUrl(state: string, origin: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${origin}/api/auth/gmail/callback`,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  })
  return `${GOOGLE_AUTH_URL}?${params}`
}

export async function exchangeCode(code: string, origin: string): Promise<GmailTokens> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${origin}/api/auth/gmail/callback`,
      grant_type: "authorization_code",
    }),
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`)
  const data = await res.json()
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in as number) * 1000,
  }
}

async function doRefresh(refreshToken: string): Promise<Pick<GmailTokens, "accessToken" | "expiresAt">> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`)
  const data = await res.json()
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in as number) * 1000,
  }
}

export async function getValidAccessToken(connectionId: string): Promise<string> {
  const { prisma } = await import("@/lib/prisma")
  const { decrypt, encrypt } = await import("@/lib/encrypt")

  const conn = await prisma.emailConnection.findUnique({ where: { id: connectionId } })
  if (!conn) throw new Error("Email connection not found")

  const tokens: GmailTokens = JSON.parse(decrypt(conn.encCredentials))

  if (Date.now() < tokens.expiresAt - 60_000) return tokens.accessToken

  const refreshed = await doRefresh(tokens.refreshToken)
  const updated: GmailTokens = { ...tokens, ...refreshed }

  await prisma.emailConnection.update({
    where: { id: connectionId },
    data: { encCredentials: encrypt(JSON.stringify(updated)) },
  })

  return updated.accessToken
}

export async function getGmailProfile(accessToken: string): Promise<{ emailAddress: string }> {
  const res = await fetch(`${GMAIL_API}/users/me/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Profile fetch failed: ${await res.text()}`)
  return res.json()
}

export async function searchMessages(
  accessToken: string,
  query: string,
  maxResults = 100,
): Promise<string[]> {
  const params = new URLSearchParams({ q: query, maxResults: String(maxResults) })
  const res = await fetch(`${GMAIL_API}/users/me/messages?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Message search failed: ${await res.text()}`)
  const data = await res.json()
  return ((data.messages ?? []) as { id: string }[]).map((m) => m.id)
}

export interface GmailMessage {
  id: string
  subject: string
  from: string
  date: string
  body: string
}

function extractBody(parts: unknown[]): string {
  for (const p of parts as { mimeType: string; body?: { data?: string }; parts?: unknown[] }[]) {
    if (p.mimeType === "text/plain" && p.body?.data) {
      return Buffer.from(p.body.data, "base64url").toString("utf-8")
    }
    if (p.parts) {
      const found = extractBody(p.parts)
      if (found) return found
    }
  }
  for (const p of parts as { mimeType: string; body?: { data?: string } }[]) {
    if (p.mimeType === "text/html" && p.body?.data) {
      return Buffer.from(p.body.data, "base64url")
        .toString("utf-8")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    }
  }
  return ""
}

export async function getMessage(accessToken: string, messageId: string): Promise<GmailMessage> {
  const res = await fetch(`${GMAIL_API}/users/me/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Message fetch failed: ${await res.text()}`)
  const data = await res.json()

  const headers = (data.payload?.headers ?? []) as { name: string; value: string }[]
  const h = (name: string) =>
    headers.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value ?? ""

  let body = ""
  if (data.payload?.body?.data) {
    body = Buffer.from(data.payload.body.data as string, "base64url").toString("utf-8")
  } else if (data.payload?.parts) {
    body = extractBody(data.payload.parts as unknown[])
  }

  return {
    id: data.id as string,
    subject: h("Subject"),
    from: h("From"),
    date: h("Date"),
    body: body.slice(0, 4000),
  }
}
