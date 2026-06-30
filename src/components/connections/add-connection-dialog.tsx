"use client"

import { useState, useTransition } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Loader2, ExternalLink } from "lucide-react"
import { createConnection } from "@/app/(dashboard)/connections/actions"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { blockedInDemo, IS_DEMO } from "@/lib/demo-client"
import { ProviderIcon } from "@/components/provider-icon"

const providers = [
  {
    value: "openai",
    label: "OpenAI",
    hint: "API Keys page → Settings → API Keys",
    keyUrl: "https://platform.openai.com/api-keys",
    keyPrefix: "sk-",
    placeholder: "sk-...",
  },
  {
    value: "anthropic",
    label: "Anthropic",
    hint: "Console → Settings → API Keys",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyPrefix: "sk-ant-",
    placeholder: "sk-ant-...",
  },
  {
    value: "gemini",
    label: "Google Gemini",
    hidden: true,
  },
  {
    value: "bedrock",
    label: "AWS Bedrock",
    hint: "IAM Console → Create user with AWSBillingReadOnlyAccess policy",
    keyUrl: "https://console.aws.amazon.com/iam/home#/users",
    keyPrefix: "AKIA",
    placeholder: null,
    hidden: true,
  },
  {
    value: "groq",
    label: "Groq",
    hint: "GroqCloud Console → API Keys — Enterprise plan required for usage metrics",
    keyUrl: "https://console.groq.com/keys",
    keyPrefix: "gsk_",
    placeholder: "gsk_...",
  },
  {
    value: "mistral",
    label: "Mistral AI",
    hint: "La Plateforme → Workspace → API Keys",
    keyUrl: "https://console.mistral.ai/api-keys",
    keyPrefix: "",
    placeholder: "...",
    hidden: true,
  },
  {
    value: "grok",
    label: "xAI / Grok",
    hint: "xAI Console → API Keys",
    keyUrl: "https://console.x.ai",
    keyPrefix: "xai-",
    placeholder: "xai-...",
    hidden: true,
  },
  {
    value: "openrouter",
    label: "OpenRouter",
    hint: "Keys → Create key",
    keyUrl: "https://openrouter.ai/keys",
    keyPrefix: "sk-or-",
    placeholder: "sk-or-...",
  },
  {
    value: "litellm",
    label: "LiteLLM Proxy",
    hint: "Self-hosted LiteLLM — needs your proxy URL and master key",
    keyUrl: "https://docs.litellm.ai/docs/proxy/quick_start",
    keyPrefix: "",
    placeholder: null, // uses multi-field form
    hidden: true,
  },
]

const AWS_REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "eu-west-1", "eu-west-2", "eu-central-1",
  "ap-northeast-1", "ap-southeast-1", "ap-southeast-2",
]

function validateKey(providerValue: string, key: string): string | null {
  if (key.length < 8) return "Key looks too short"
  const p = providers.find((x) => x.value === providerValue)
  if (!p || !p.keyPrefix) return null
  if (!key.startsWith(p.keyPrefix)) return `Key should start with "${p.keyPrefix}"`
  return null
}

interface AddConnectionDialogProps {
  open?: boolean
  onOpenChange?: (v: boolean) => void
  hideTrigger?: boolean
}

export function AddConnectionDialog({ open: openProp, onOpenChange, hideTrigger }: AddConnectionDialogProps = {}) {
  const router = useRouter()
  const [internalOpen, setInternalOpen] = useState(false)
  const open = openProp ?? internalOpen
  const setOpen = (v: boolean) => {
    if (onOpenChange) onOpenChange(v)
    else setInternalOpen(v)
  }
  const [provider, setProvider] = useState<string>("")
  const [apiKey, setApiKey] = useState("")
  // Bedrock-specific
  const [awsAccessKeyId, setAwsAccessKeyId] = useState("")
  const [awsSecretKey, setAwsSecretKey] = useState("")
  const [awsRegion, setAwsRegion] = useState("us-east-1")
  // LiteLLM-specific
  const [litellmUrl, setLitellmUrl] = useState("")

  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  const selectedProvider = providers.find((p) => p.value === provider)
  const isBedrock = provider === "bedrock"
  const isLiteLLM = provider === "litellm"
  const isMultiField = isBedrock || isLiteLLM

  function reset() {
    setProvider("")
    setApiKey("")
    setAwsAccessKeyId("")
    setAwsSecretKey("")
    setAwsRegion("us-east-1")
    setLitellmUrl("")
    setError("")
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (blockedInDemo()) return

    if (isBedrock) {
      if (!awsAccessKeyId.trim() || !awsSecretKey.trim()) return
      if (!awsAccessKeyId.startsWith("AKIA")) {
        setError('Access Key ID should start with "AKIA"')
        return
      }
    } else if (isLiteLLM) {
      if (!litellmUrl.trim() || !apiKey.trim()) return
      try { new URL(litellmUrl.trim()) } catch {
        setError("Enter a valid URL (e.g. https://llm.yourcompany.com)")
        return
      }
    } else {
      if (!provider || !apiKey.trim()) return
      const keyErr = validateKey(provider, apiKey.trim())
      if (keyErr) { setError(keyErr); return }
    }

    startTransition(async () => {
      let credJson: string
      let isJsonCreds = false
      if (isBedrock) {
        credJson = JSON.stringify({ accessKeyId: awsAccessKeyId.trim(), secretAccessKey: awsSecretKey.trim(), region: awsRegion })
        isJsonCreds = true
      } else if (isLiteLLM) {
        credJson = JSON.stringify({ baseUrl: litellmUrl.trim(), apiKey: apiKey.trim() })
        isJsonCreds = true
      } else {
        credJson = apiKey.trim()
      }

      const result = await createConnection(provider, credJson, isJsonCreds)
      if (result?.error) {
        setError(result.error)
      } else {
        setOpen(false)
        reset()
        const label = providers.find((p) => p.value === provider)?.label ?? provider
        toast.success(`${label} connected`, { description: "Backfill started — syncing up to 3 months of usage." })
        router.refresh()
      }
    })
  }

  const canSubmit = (isBedrock
    ? awsAccessKeyId.trim() && awsSecretKey.trim() && !isPending
    : isLiteLLM
      ? litellmUrl.trim() && apiKey.trim() && !isPending
      : provider && apiKey.trim() && !isPending) && !IS_DEMO

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      {!hideTrigger && (
        <DialogTrigger
          render={
            <Button size="sm" disabled={IS_DEMO} className="bg-zinc-900 text-white hover:bg-zinc-700 gap-1.5" />
          }
        >
          <Plus className="h-3.5 w-3.5" />
          Add connection
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-zinc-900">
            Connect a provider
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="mt-2 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-600">Provider</Label>
            <Select value={provider} onValueChange={(v) => { if (v !== null) { setProvider(v); setApiKey(""); setLitellmUrl(""); setError("") } }}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select a provider" />
              </SelectTrigger>
              <SelectContent>
                {providers.filter((p) => !p.hidden).map((p) => (
                  <SelectItem key={p.value} value={p.value} className="text-sm">
                    <span className="flex items-center gap-2">
                      <ProviderIcon provider={p.value} className="h-5 w-5 rounded-md" />
                      {p.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(provider === "openrouter" || provider === "litellm") && (
            <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
              <p className="text-xs font-medium text-amber-800 mb-1">Watch out for double-counting</p>
              <p className="text-[11px] text-amber-700 leading-relaxed">
                {provider === "openrouter"
                  ? "OpenRouter tracks all requests it routes — including ones to OpenAI, Anthropic, and others. If you also have those providers connected directly in Mizan, their usage APIs will report the same requests again."
                  : "LiteLLM tracks all requests going through your proxy — which may include calls to OpenAI, Anthropic, and others. If those providers are also connected directly in Mizan, their usage APIs will report the same requests again."}
                {" "}Only connect the underlying providers directly if they have spend that doesn&apos;t go through {provider === "openrouter" ? "OpenRouter" : "LiteLLM"}.
              </p>
            </div>
          )}

          {provider === "gemini" && (
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
              <p className="text-xs font-medium text-blue-800 mb-1">
                Vertex AI — real usage data
              </p>
              <p className="text-[11px] text-blue-700 mb-2.5">
                Connect via Google OAuth to sync actual token usage and costs from Cloud
                Monitoring. Requires a GCP project with Vertex AI enabled.
              </p>
              <button
                type="button"
                onClick={() => { if (blockedInDemo()) return; setOpen(false); window.location.href = "/api/auth/gcp" }}
                disabled={IS_DEMO}
                className="flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-900 transition-colors"
              >
                Connect with Google
                <ExternalLink className="h-3 w-3" />
              </button>
            </div>
          )}

          {provider && !isMultiField && provider !== "gemini" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-600">API Key</Label>
              <Input
                type="password"
                placeholder={selectedProvider?.placeholder ?? ""}
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setError("") }}
                className="h-9 font-mono text-sm"
              />
              {selectedProvider && (
                <p className="text-[11px] text-zinc-400 flex items-center gap-1">
                  {selectedProvider.hint}
                  {selectedProvider.keyUrl && (
                    <a
                      href={selectedProvider.keyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-zinc-500 hover:text-zinc-800 transition-colors underline underline-offset-2"
                    >
                      Open
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </p>
              )}
            </div>
          )}

          {isBedrock && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-600">Access Key ID</Label>
                <Input
                  type="text"
                  placeholder="AKIAIOSFODNN7EXAMPLE"
                  value={awsAccessKeyId}
                  onChange={(e) => { setAwsAccessKeyId(e.target.value); setError("") }}
                  className="h-9 font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-600">Secret Access Key</Label>
                <Input
                  type="password"
                  placeholder="wJalrXUtn..."
                  value={awsSecretKey}
                  onChange={(e) => setAwsSecretKey(e.target.value)}
                  className="h-9 font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-600">Region</Label>
                <Select value={awsRegion} onValueChange={(v) => { if (v !== null) setAwsRegion(v) }}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AWS_REGIONS.map((r) => (
                      <SelectItem key={r} value={r} className="font-mono text-sm">{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-zinc-400 flex items-center gap-1">
                  {selectedProvider?.hint}
                  {selectedProvider?.keyUrl && (
                    <a
                      href={selectedProvider.keyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-zinc-500 hover:text-zinc-800 transition-colors underline underline-offset-2"
                    >
                      Open
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </p>
              </div>
            </>
          )}

          {isLiteLLM && (
            <>
              <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-3">
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  LiteLLM is self-hosted — enter your proxy&apos;s base URL and the master key
                  (or a virtual key with <code className="font-mono text-[10px]">/spend/logs</code> read access).
                  {" "}
                  <a
                    href="https://docs.litellm.ai/docs/proxy/cost_tracking"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-zinc-500 hover:text-zinc-800 underline underline-offset-2 transition-colors"
                  >
                    Docs <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-600">Proxy URL</Label>
                <Input
                  type="url"
                  placeholder="https://llm.yourcompany.com"
                  value={litellmUrl}
                  onChange={(e) => { setLitellmUrl(e.target.value); setError("") }}
                  className="h-9 font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-600">Master / Virtual Key</Label>
                <Input
                  type="password"
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setError("") }}
                  className="h-9 font-mono text-sm"
                />
              </div>
            </>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button" variant="outline" size="sm"
              onClick={() => { setOpen(false); reset() }}
              className="h-8 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit" size="sm"
              disabled={!canSubmit}
              className="h-8 bg-zinc-900 text-xs text-white hover:bg-zinc-700"
            >
              {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Connect"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
