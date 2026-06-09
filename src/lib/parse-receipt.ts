export interface ParsedReceipt {
  isAiBillingEmail: boolean
  provider: string | null
  amountUsd: number | null
  billingPeriodStart: string | null
  billingPeriodEnd: string | null
  invoiceId: string | null
}

const EMPTY: ParsedReceipt = {
  isAiBillingEmail: false,
  provider: null,
  amountUsd: null,
  billingPeriodStart: null,
  billingPeriodEnd: null,
  invoiceId: null,
}

export async function parseEmailAsReceipt(
  subject: string,
  from: string,
  body: string,
): Promise<ParsedReceipt> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return EMPTY

  const prompt = `From: ${from}
Subject: ${subject}
---
${body}
---
Is this a billing receipt or invoice for an AI service/API? If yes, extract the details.

Reply with JSON only (no markdown fences):
{
  "isAiBillingEmail": <true|false>,
  "provider": <"openai"|"anthropic"|"google"|"aws"|"mistral"|"cohere"|"perplexity"|"cursor"|"together"|"replicate"|"other"|null>,
  "amountUsd": <number|null>,
  "billingPeriodStart": <"YYYY-MM-DD"|null>,
  "billingPeriodEnd": <"YYYY-MM-DD"|null>,
  "invoiceId": <string|null>
}`

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    })

    if (!res.ok) return EMPTY

    const data = await res.json()
    const text: string = (data.content?.[0]?.text ?? "{}").trim()
    const parsed = JSON.parse(text) as ParsedReceipt
    return parsed
  } catch {
    return EMPTY
  }
}
