"use client"

import { useState, useTransition } from "react"
import { Settings, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { updateGcpProject } from "@/app/(dashboard)/connections/actions"
import { blockedInDemo, IS_DEMO } from "@/lib/demo-client"

export function SetGcpProjectButton({ connectionId }: { connectionId: string }) {
  const [open, setOpen] = useState(false)
  const [projectId, setProjectId] = useState("")
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (blockedInDemo()) return
    if (!projectId.trim()) return
    setError("")
    startTransition(async () => {
      const result = await updateGcpProject(connectionId, projectId.trim())
      if (result?.error) {
        setError(result.error)
      } else {
        setOpen(false)
        setProjectId("")
      }
    })
  }

  return (
    <>
      <button
        onClick={() => { if (blockedInDemo()) return; setOpen(true) }}
        disabled={IS_DEMO}
        title="Set GCP project"
        className="flex h-7 items-center gap-1 rounded-md px-2 text-[10px] text-amber-600 transition-colors hover:bg-amber-50"
      >
        <Settings className="h-3 w-3" />
        Set project
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-zinc-900">
              Set GCP project ID
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-zinc-500">
            Enter the Google Cloud project ID where Vertex AI usage is billed. Find it in the
            Google Cloud Console under{" "}
            <span className="font-mono">Project settings → Project ID</span>.
          </p>
          <form onSubmit={handleSubmit} className="mt-1 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-600">Project ID</Label>
              <Input
                type="text"
                placeholder="my-gcp-project-123"
                value={projectId}
                onChange={(e) => { setProjectId(e.target.value); setError("") }}
                className="h-9 font-mono text-sm"
                required
              />
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex justify-end gap-2">
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
                disabled={isPending || !projectId.trim() || IS_DEMO}
                className="h-8 bg-zinc-900 text-xs text-white hover:bg-zinc-700"
              >
                {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save & sync"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
