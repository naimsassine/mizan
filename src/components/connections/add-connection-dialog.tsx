"use client"

import { useState, useTransition } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Loader2, ExternalLink } from "lucide-react"
import { createConnection } from "@/app/(dashboard)/connections/actions"

const providers = [
  {
    value: "openai",
    label: "OpenAI",
    hint: "Find your API key at platform.openai.com/api-keys",
    keyPrefix: "sk-",
    placeholder: "sk-...",
  },
  {
    value: "anthropic",
    label: "Anthropic",
    hint: "Find your API key at console.anthropic.com",
    keyPrefix: "sk-ant-",
    placeholder: "sk-ant-...",
  },
  {
    value: "gemini",
    label: "Google Gemini",
    hint: "Find your AI Studio API key at aistudio.google.com",
    keyPrefix: "AIza",
    placeholder: "AIza...",
  },
  {
    value: "bedrock",
    label: "AWS Bedrock",
    hint: "IAM user with Cost Explorer read permissions (AWSBillingReadOnlyAccess)",
    keyPrefix: "AKIA",
    placeholder: null, // uses multi-field form
  },
]

const AWS_REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "eu-west-1", "eu-west-2", "eu-central-1",
  "ap-northeast-1", "ap-southeast-1", "ap-southeast-2",
]

function validateKey(providerValue: string, key: string): string | null {
  const p = providers.find((x) => x.value === providerValue)
  if (!p || !p.keyPrefix) return null
  if (!key.startsWith(p.keyPrefix)) {
    return `Key should start with "${p.keyPrefix}"`
  }
  return null
}

export function AddConnectionDialog() {
  const [open, setOpen] = useState(false)
  const [provider, setProvider] = useState<string>("")
  const [apiKey, setApiKey] = useState("")
  // Bedrock-specific fields
  const [awsAccessKeyId, setAwsAccessKeyId] = useState("")
  const [awsSecretKey, setAwsSecretKey] = useState("")
  const [awsRegion, setAwsRegion] = useState("us-east-1")

  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  const selectedProvider = providers.find((p) => p.value === provider)
  const isBedrock = provider === "bedrock"

  function reset() {
    setProvider("")
    setApiKey("")
    setAwsAccessKeyId("")
    setAwsSecretKey("")
    setAwsRegion("us-east-1")
    setError("")
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (isBedrock) {
      if (!awsAccessKeyId.trim() || !awsSecretKey.trim()) return
      if (!awsAccessKeyId.startsWith("AKIA")) {
        setError('Access Key ID should start with "AKIA"')
        return
      }
    } else {
      if (!provider || !apiKey.trim()) return
      const keyErr = validateKey(provider, apiKey.trim())
      if (keyErr) { setError(keyErr); return }
    }

    startTransition(async () => {
      const credJson = isBedrock
        ? JSON.stringify({ accessKeyId: awsAccessKeyId.trim(), secretAccessKey: awsSecretKey.trim(), region: awsRegion })
        : apiKey.trim()

      const result = await createConnection(provider, credJson, isBedrock)
      if (result?.error) {
        setError(result.error)
      } else {
        setOpen(false)
        reset()
      }
    })
  }

  const canSubmit = isBedrock
    ? awsAccessKeyId.trim() && awsSecretKey.trim() && !isPending
    : provider && apiKey.trim() && !isPending

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <DialogTrigger
        render={
          <Button size="sm" className="bg-zinc-900 text-white hover:bg-zinc-700 gap-1.5" />
        }
      >
        <Plus className="h-3.5 w-3.5" />
        Add connection
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-zinc-900">
            Connect a provider
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="mt-2 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-600">Provider</Label>
            <Select value={provider} onValueChange={(v) => { if (v !== null) { setProvider(v); setApiKey(""); setError("") } }}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select a provider" />
              </SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p.value} value={p.value} className="text-sm">
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {provider === "gemini" && (
            <div className="space-y-3">
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
                  onClick={() => { setOpen(false); window.location.href = "/api/auth/gcp" }}
                  className="flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-900 transition-colors"
                >
                  Connect with Google
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-zinc-100" />
                <span className="text-[10px] text-zinc-400">or use AI Studio key (no usage data)</span>
                <div className="h-px flex-1 bg-zinc-100" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-600">AI Studio API Key</Label>
                <Input
                  type="password"
                  placeholder={selectedProvider?.placeholder ?? ""}
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setError("") }}
                  className="h-9 font-mono text-sm"
                />
                <p className="text-[11px] text-zinc-400">{selectedProvider?.hint}</p>
              </div>
            </div>
          )}

          {provider && !isBedrock && provider !== "gemini" && (
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
                <p className="text-[11px] text-zinc-400">{selectedProvider.hint}</p>
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
                <p className="text-[11px] text-zinc-400">{selectedProvider?.hint}</p>
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
