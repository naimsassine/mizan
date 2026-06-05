"use client"

import { useState, useTransition } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Loader2 } from "lucide-react"
import { createConnection } from "@/app/(dashboard)/connections/actions"

const providers = [
  { value: "openai", label: "OpenAI", hint: "Find your API key at platform.openai.com/api-keys" },
  { value: "anthropic", label: "Anthropic", hint: "Find your API key at console.anthropic.com" },
  { value: "gemini", label: "Google Gemini", hint: "Find your API key at aistudio.google.com" },
  { value: "bedrock", label: "AWS Bedrock", hint: "Use an IAM access key with Cost Explorer read permissions" },
]

export function AddConnectionDialog() {
  const [open, setOpen] = useState(false)
  const [provider, setProvider] = useState<string>("")
  const [apiKey, setApiKey] = useState("")
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  const selectedProvider = providers.find((p) => p.value === provider)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!provider || !apiKey.trim()) return
    setError("")

    startTransition(async () => {
      const result = await createConnection(provider, apiKey.trim())
      if (result?.error) {
        setError(result.error)
      } else {
        setOpen(false)
        setProvider("")
        setApiKey("")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
            <Select
              value={provider}
              onValueChange={(value) => {
                if (value !== null) setProvider(value)
              }}
            >
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

          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-600">API Key</Label>
            <Input
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="h-9 font-mono text-sm"
            />
            {selectedProvider && (
              <p className="text-[11px] text-zinc-400">{selectedProvider.hint}</p>
            )}
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              className="h-8 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!provider || !apiKey.trim() || isPending}
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
