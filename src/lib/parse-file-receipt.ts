import type { ParsedReceipt } from "./parse-receipt"

const EMPTY: ParsedReceipt = {
  isAiBillingEmail: false,
  provider: null,
  amountUsd: null,
  billingPeriodStart: null,
  billingPeriodEnd: null,
  invoiceId: null,
  usageType: null,
}

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
])

const PROMPT =
  'Extract AI service billing information from this document. Is it a receipt or invoice for an AI API or subscription? Reply with JSON only (no markdown fences): { "isAiBillingEmail": boolean, "provider": "openai"|"anthropic"|"google"|"aws"|"groq"|"mistral"|"cohere"|"perplexity"|"cursor"|"together"|"replicate"|"other"|null, "amountUsd": number|null, "billingPeriodStart": "YYYY-MM-DD"|null, "billingPeriodEnd": "YYYY-MM-DD"|null, "invoiceId": string|null, "usageType": "api"|"subscription"|null }. usageType: "subscription" = flat-rate monthly plan (ChatGPT Plus, Claude Pro, Copilot, Cursor subscription, etc). "api" = usage-based API invoice (pay-per-token). null if unclear.'

export async function parseFileAsReceipt(
  buffer: Buffer,
  mimeType: string,
): Promise<ParsedReceipt> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return EMPTY

  const isPdf = mimeType === "application/pdf"
  const isImage = SUPPORTED_IMAGE_TYPES.has(mimeType)
  if (!isPdf && !isImage) return EMPTY

  const base64 = buffer.toString("base64")

  const fileBlock = isPdf
    ? {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64 },
      }
    : {
        type: "image",
        source: { type: "base64", media_type: mimeType, data: base64 },
      }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 400,
        messages: [
          {
            role: "user",
            content: [fileBlock, { type: "text", text: PROMPT }],
          },
        ],
      }),
    })

    if (!res.ok) return EMPTY
    const data = await res.json()
    const text: string = (data.content?.[0]?.text ?? "{}").trim()
    return JSON.parse(text) as ParsedReceipt
  } catch {
    return EMPTY
  }
}
