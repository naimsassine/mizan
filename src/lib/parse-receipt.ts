export interface ParsedReceipt {
  isAiBillingEmail: boolean
  provider: string | null
  amountUsd: number | null
  billingPeriodStart: string | null
  billingPeriodEnd: string | null
  invoiceId: string | null
  usageType: "api" | "subscription" | null
}

const EMPTY: ParsedReceipt = {
  isAiBillingEmail: false,
  provider: null,
  amountUsd: null,
  billingPeriodStart: null,
  billingPeriodEnd: null,
  invoiceId: null,
  usageType: null,
}

export async function parseEmailAsReceipt(
  subject: string,
  from: string,
  body: string,
): Promise<ParsedReceipt> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error("[parse-receipt] ANTHROPIC_API_KEY is not set — skipping LLM parse")
    return EMPTY
  }

  const prompt = `From: ${from}
Subject: ${subject}
---
${body}
---
Is this a billing receipt or invoice for an AI service/API? If yes, extract the details.

Reply with JSON only (no markdown fences):
{
  "isAiBillingEmail": <true|false>,
  "provider": <"openai"|"anthropic"|"google"|"aws"|"groq"|"mistral"|"cohere"|"perplexity"|"cursor"|"together"|"replicate"|"moonshot"|"deepseek"|"xai"|"huggingface"|"fireworks"|"anyscale"|"other"|null>,
  "amountUsd": <number|null>,
  "billingPeriodStart": <"YYYY-MM-DD"|null>,
  "billingPeriodEnd": <"YYYY-MM-DD"|null>,
  "invoiceId": <string|null>,
  "usageType": <"api"|"subscription"|null>
}
usageType rules: "subscription" = flat-rate monthly plan (ChatGPT Plus, Claude Pro, Copilot, Cursor subscription, etc). "api" = usage-based API invoice (pay-per-token). null if unclear.`

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

    if (!res.ok) {
      console.error(`[parse-receipt] Anthropic API error ${res.status}: ${await res.text()}`)
      return EMPTY
    }

    const data = await res.json()
    const text: string = (data.content?.[0]?.text ?? "{}")
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
    const parsed = JSON.parse(text) as ParsedReceipt
    return parsed
  } catch (err) {
    console.error("[parse-receipt] Failed:", err)
    return EMPTY
  }
}
