import { cn } from "@/lib/utils"

// Brand-ish colors + monogram per provider. Used for quick visual identification
// on cards and lists (no external logo assets required).
const PROVIDER_META: Record<string, { mono: string; className: string }> = {
  openai: { mono: "AI", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  anthropic: { mono: "A", className: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300" },
  gemini: { mono: "G", className: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  bedrock: { mono: "B", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300" },
  groq: { mono: "Gq", className: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" },
  mistral: { mono: "M", className: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300" },
  grok: { mono: "X", className: "bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300" },
  kimi: { mono: "K", className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300" },
  openrouter: { mono: "OR", className: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" },
  litellm: { mono: "LL", className: "bg-lime-100 text-lime-700 dark:bg-lime-500/15 dark:text-lime-300" },
}

export function ProviderIcon({
  provider,
  className,
}: {
  provider: string
  className?: string
}) {
  const meta = PROVIDER_META[provider] ?? {
    mono: provider.slice(0, 1).toUpperCase(),
    className: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold tracking-tight",
        meta.className,
        className,
      )}
    >
      {meta.mono}
    </span>
  )
}
