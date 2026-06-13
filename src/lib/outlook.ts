const MS_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
const MS_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
const GRAPH_API = "https://graph.microsoft.com/v1.0"
const SCOPE = "https://graph.microsoft.com/Mail.Read offline_access"

// KQL search hitting subject + body + sender for AI provider names
const AI_SEARCH_QUERY =
  "openai OR anthropic OR claude OR chatgpt OR mistral OR cohere OR perplexity OR cursor OR groq OR gemini OR bedrock OR grok OR moonshot OR kimi OR deepseek OR together OR replicate OR huggingface OR fireworks OR anyscale"

export interface OutlookTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

export function buildOAuthUrl(state: string, origin: string): string {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    redirect_uri: `${origin}/api/auth/outlook/callback`,
    response_type: "code",
    scope: SCOPE,
    response_mode: "query",
    state,
  })
  return `${MS_AUTH_URL}?${params}`
}

export async function exchangeCode(code: string, origin: string): Promise<OutlookTokens> {
  const res = await fetch(MS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      redirect_uri: `${origin}/api/auth/outlook/callback`,
      grant_type: "authorization_code",
      scope: SCOPE,
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

async function doRefresh(
  refreshToken: string,
): Promise<Pick<OutlookTokens, "accessToken" | "expiresAt">> {
  const res = await fetch(MS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      grant_type: "refresh_token",
      scope: SCOPE,
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

  const tokens: OutlookTokens = JSON.parse(decrypt(conn.encCredentials))
  if (Date.now() < tokens.expiresAt - 60_000) return tokens.accessToken

  const refreshed = await doRefresh(tokens.refreshToken)
  const updated: OutlookTokens = { ...tokens, ...refreshed }

  await prisma.emailConnection.update({
    where: { id: connectionId },
    data: { encCredentials: encrypt(JSON.stringify(updated)) },
  })

  return updated.accessToken
}

export async function getOutlookProfile(accessToken: string): Promise<{ emailAddress: string }> {
  const res = await fetch(`${GRAPH_API}/me?$select=mail,userPrincipalName`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Profile fetch failed: ${await res.text()}`)
  const data = await res.json()
  return { emailAddress: (data.mail ?? data.userPrincipalName) as string }
}

export async function searchMessages(
  accessToken: string,
  maxResults = 100,
): Promise<string[]> {
  const params = new URLSearchParams({
    "$search": `"${AI_SEARCH_QUERY}"`,
    "$top": String(maxResults),
    "$select": "id",
    "$orderby": "receivedDateTime desc",
  })
  const res = await fetch(`${GRAPH_API}/me/messages?${params}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ConsistencyLevel: "eventual",
    },
  })
  if (!res.ok) throw new Error(`Message search failed: ${await res.text()}`)
  const data = await res.json()
  return ((data.value ?? []) as { id: string }[]).map((m) => m.id)
}

export interface OutlookMessage {
  id: string
  subject: string
  from: string
  date: string
  body: string
}

export async function getMessage(
  accessToken: string,
  messageId: string,
): Promise<OutlookMessage> {
  const params = new URLSearchParams({
    "$select": "id,subject,from,receivedDateTime,body",
  })
  const res = await fetch(`${GRAPH_API}/me/messages/${messageId}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Message fetch failed: ${await res.text()}`)
  const data = await res.json()

  let body: string = (data.body?.content as string) ?? ""
  if ((data.body?.contentType as string) === "html") {
    body = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  }

  return {
    id: data.id as string,
    subject: (data.subject as string) ?? "",
    from: (data.from?.emailAddress?.address as string) ?? "",
    date: (data.receivedDateTime as string) ?? "",
    body: body.slice(0, 4000),
  }
}
