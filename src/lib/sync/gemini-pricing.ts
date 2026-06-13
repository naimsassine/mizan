const BILLING_API = "https://cloudbilling.googleapis.com/v1"

export interface ModelPricing {
  input: number   // USD per 1M tokens
  output: number  // USD per 1M tokens
}

// 24-hour in-memory cache — prices change infrequently
let cache: { pricing: Record<string, ModelPricing>; expiry: number } | null = null

export async function fetchGeminiPricing(): Promise<Record<string, ModelPricing>> {
  if (cache && Date.now() < cache.expiry) return cache.pricing

  try {
    // 1. Find the Generative Language / Gemini API service in the billing catalog
    const svcRes = await fetch(`${BILLING_API}/services?pageSize=300`)
    if (!svcRes.ok) return {}

    const { services = [] } = await svcRes.json() as { services: { name: string; displayName: string }[] }
    const geminiService = services.find(s => {
      const n = s.displayName.toLowerCase()
      return n.includes("generative language") || n === "gemini api"
    })
    if (!geminiService) {
      console.warn("[mizan/pricing] Gemini API service not found in billing catalog")
      return {}
    }

    // 2. Fetch all SKUs for that service
    const skuRes = await fetch(`${BILLING_API}/${geminiService.name}/skus?pageSize=500`)
    if (!skuRes.ok) return {}

    const { skus = [] } = await skuRes.json() as { skus: unknown[] }
    const pricing: Record<string, ModelPricing> = {}

    for (const sku of skus) {
      const s = sku as {
        description?: string
        pricingInfo?: { pricingExpression?: { usageUnit?: string; tieredRates?: { unitPrice: { units?: string; nanos?: number } }[] } }[]
      }

      const desc = s.description ?? ""
      const rates = s.pricingInfo?.[0]?.pricingExpression?.tieredRates
      if (!rates?.length) continue

      const { units = "0", nanos = 0 } = rates[0].unitPrice
      const pricePerUnit = Number(units) + nanos / 1e9
      if (pricePerUnit === 0) continue

      // SKU descriptions look like: "Gemini 2.5 Flash: Input tokens"
      // or "Gemini 3.1 Flash Image: Output tokens"
      const match = desc.match(/^(gemini[\s\w.\-]+?):\s*(input|output)\s*tokens?/i)
      if (!match) continue

      const tokenType = match[2].toLowerCase() as "input" | "output"
      // "Gemini 2.5 Flash" → "gemini-2.5-flash", "Gemini 3.1 Flash Image" → "gemini-3.1-flash-image"
      const modelId = match[1].trim().toLowerCase().replace(/\s+/g, "-")
      const pricePerMillion = pricePerUnit * 1_000_000

      if (!pricing[modelId]) pricing[modelId] = { input: 0, output: 0 }
      pricing[modelId][tokenType] = pricePerMillion
    }

    console.log(`[mizan/pricing] Loaded ${Object.keys(pricing).length} Gemini model prices from billing catalog`)
    cache = { pricing, expiry: Date.now() + 24 * 60 * 60 * 1000 }
    return pricing
  } catch (err) {
    console.error("[mizan/pricing] Failed to fetch Gemini pricing:", err)
    return {}
  }
}
