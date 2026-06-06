import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/encrypt"
import { format, startOfDay, subDays } from "date-fns"
import { createHmac, createHash } from "crypto"

// --- AWS Signature V4 ---

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex")
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest()
}

function signingKey(secretKey: string, dateStamp: string, region: string, service: string): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${secretKey}`, dateStamp), region), service), "aws4_request")
}

async function costExplorerRequest(
  body: string,
  accessKeyId: string,
  secretAccessKey: string
): Promise<Response> {
  const service = "ce"
  const region = "us-east-1"
  const host = "ce.us-east-1.amazonaws.com"
  const endpoint = `https://${host}/`

  const now = new Date()
  const amzDate = now.toISOString().replace(/[:\-]/g, "").slice(0, 15) + "Z"
  const dateStamp = amzDate.slice(0, 8)
  const target = "AWSInsightsIndexService.GetCostAndUsage"
  const contentType = "application/x-amz-json-1.1"
  const payloadHash = sha256Hex(body)

  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-amz-target:${target}\n`
  const signedHeaders = "content-type;host;x-amz-date;x-amz-target"

  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n")

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n")

  const signature = hmac(signingKey(secretAccessKey, dateStamp, region, service), stringToSign).toString("hex")

  const authHeader =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  return fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      Host: host,
      "X-Amz-Date": amzDate,
      "X-Amz-Target": target,
      Authorization: authHeader,
    },
    body,
  })
}

// --- Usage type parsing ---

// UsageType examples:
//   USE1-anthropic.claude-3-haiku-20240307-v1:0-InputTokens:InvokeModel
//   USW2-amazon.titan-text-express-v1-OutputTokens:InvokeModel
function parseUsageType(usageType: string): { model: string | null; tokenType: "input" | "output" | null } {
  const withoutRegion = usageType.replace(/^[A-Z]{2,4}[0-9]?-/, "")
  if (withoutRegion.includes("-InputTokens")) {
    return { model: withoutRegion.split("-InputTokens")[0], tokenType: "input" }
  }
  if (withoutRegion.includes("-OutputTokens")) {
    return { model: withoutRegion.split("-OutputTokens")[0], tokenType: "output" }
  }
  return { model: null, tokenType: null }
}

// --- Fetch and upsert ---

type DailyModelCost = Map<string, { inputCost: number; outputCost: number }>

async function fetchBedrockCosts(
  accessKeyId: string,
  secretAccessKey: string,
  from: Date,
  to: Date
): Promise<Map<string, DailyModelCost>> {
  const body = JSON.stringify({
    TimePeriod: {
      Start: format(from, "yyyy-MM-dd"),
      End: format(to, "yyyy-MM-dd"),
    },
    Granularity: "DAILY",
    Filter: {
      Dimensions: { Key: "SERVICE", Values: ["Amazon Bedrock"] },
    },
    Metrics: ["UnblendedCost"],
    GroupBy: [{ Type: "DIMENSION", Key: "USAGE_TYPE" }],
  })

  const res = await costExplorerRequest(body, accessKeyId, secretAccessKey)
  if (res.status === 401 || res.status === 403) throw new Error("INVALID_CREDENTIALS")
  if (!res.ok) throw new Error(`Cost Explorer API ${res.status}`)

  const data: {
    ResultsByTime?: Array<{
      TimePeriod: { Start: string }
      Groups?: Array<{
        Keys: [string]
        Metrics: { UnblendedCost: { Amount: string } }
      }>
    }>
  } = await res.json()

  const byDate = new Map<string, DailyModelCost>()

  for (const day of data.ResultsByTime ?? []) {
    const date = day.TimePeriod.Start
    if (!byDate.has(date)) byDate.set(date, new Map())
    const modelMap = byDate.get(date)!

    for (const group of day.Groups ?? []) {
      const { model, tokenType } = parseUsageType(group.Keys[0])
      if (!model || !tokenType) continue
      const cost = parseFloat(group.Metrics.UnblendedCost.Amount) || 0
      if (cost === 0) continue

      const existing = modelMap.get(model) ?? { inputCost: 0, outputCost: 0 }
      if (tokenType === "input") existing.inputCost += cost
      else existing.outputCost += cost
      modelMap.set(model, existing)
    }
  }

  return byDate
}

// --- Main entry points ---

async function upsertBedrockRecords(
  connectionId: string,
  ownerId: string,
  ownerType: "user" | "org",
  byDate: Map<string, DailyModelCost>
) {
  for (const [dateStr, modelMap] of byDate) {
    const date = startOfDay(new Date(dateStr))
    for (const [model, costs] of modelMap) {
      const costUsd = costs.inputCost + costs.outputCost
      await prisma.usageRecord.upsert({
        where: { connectionId_date_model: { connectionId, date, model } },
        update: { costUsd },
        create: {
          connectionId, ownerId, ownerType,
          date, provider: "bedrock", model,
          inputTokens: BigInt(0),
          outputTokens: BigInt(0),
          costUsd, source: "api_poll", rawPayload: { inputCost: costs.inputCost, outputCost: costs.outputCost },
        },
      })
    }
  }
}

export async function syncBedrock(connectionId: string) {
  const connection = await prisma.providerConnection.findUnique({ where: { id: connectionId } })
  if (!connection || connection.provider !== "bedrock") return

  let credentials: { accessKeyId: string; secretAccessKey: string; region?: string }
  try {
    credentials = JSON.parse(decrypt(connection.encCredentials))
  } catch {
    await prisma.providerConnection.update({ where: { id: connectionId }, data: { status: "error" } })
    return
  }

  const ownerType = connection.ownerType as "user" | "org"
  const from = connection.backfillFrom
  const to = new Date()

  await prisma.providerConnection.update({
    where: { id: connectionId },
    data: { backfillStatus: "in_progress" },
  })

  try {
    const byDate = await fetchBedrockCosts(credentials.accessKeyId, credentials.secretAccessKey, from, to)
    await upsertBedrockRecords(connectionId, connection.ownerId, ownerType, byDate)
    await prisma.providerConnection.update({
      where: { id: connectionId },
      data: { status: "active", backfillStatus: "complete", lastSyncedAt: new Date() },
    })
  } catch (err) {
    const isCredErr = err instanceof Error && err.message === "INVALID_CREDENTIALS"
    await prisma.providerConnection.update({
      where: { id: connectionId },
      data: { status: isCredErr ? "error" : "error", backfillStatus: "failed" },
    })
  }
}

export async function syncBedrockIncremental(connectionId: string) {
  const connection = await prisma.providerConnection.findUnique({ where: { id: connectionId } })
  if (!connection || connection.provider !== "bedrock" || connection.status !== "active") return

  let credentials: { accessKeyId: string; secretAccessKey: string }
  try {
    credentials = JSON.parse(decrypt(connection.encCredentials))
  } catch {
    return
  }

  const ownerType = connection.ownerType as "user" | "org"
  const yesterday = subDays(new Date(), 1)

  try {
    const byDate = await fetchBedrockCosts(credentials.accessKeyId, credentials.secretAccessKey, yesterday, new Date())
    await upsertBedrockRecords(connectionId, connection.ownerId, ownerType, byDate)
    await prisma.providerConnection.update({
      where: { id: connectionId },
      data: { lastSyncedAt: new Date() },
    })
  } catch {
    // skip on incremental failures
  }
}
