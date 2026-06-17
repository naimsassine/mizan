import { redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import Link from "next/link"
import { Scale, BarChart2, Bell, Plug, ArrowRight, Check } from "lucide-react"
import { IS_DEMO } from "@/lib/demo"

export default async function RootPage() {
  // In demo mode there's no auth — the marketing page's only job is to drop visitors into the app.
  if (IS_DEMO) redirect("/overview")

  const { userId } = await auth()
  if (userId) redirect("/overview")

  return (
    <div className="flex min-h-full flex-col bg-white text-zinc-900">
      {/* Nav */}
      <header className="flex h-16 items-center justify-between px-6 md:px-10">
        <div className="flex items-center gap-2">
          <Scale className="h-5 w-5" strokeWidth={1.5} />
          <span className="text-sm font-semibold tracking-tight">Mizan</span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/sign-in"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded-lg bg-zinc-900 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
          >
            Get started
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center px-6 pt-20 pb-24 text-center md:pt-28">
        <span className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-500">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          10 providers supported
        </span>
        <h1 className="max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight md:text-6xl">
          Weigh your tokens.
          <br />
          <span className="text-zinc-400">One dashboard for all AI spend.</span>
        </h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-zinc-500 md:text-lg">
          Track, aggregate, and control what you spend across OpenAI, Anthropic, Gemini,
          Bedrock, and more — with budgets, alerts, and forecasts in one clean view.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/sign-up"
            className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
          >
            Start tracking free
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/sign-in"
            className="rounded-lg border border-zinc-200 px-5 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-900"
          >
            Sign in
          </Link>
        </div>

        {/* Feature grid */}
        <div className="mt-20 grid w-full max-w-4xl grid-cols-1 gap-4 text-left sm:grid-cols-3">
          {[
            {
              icon: Plug,
              title: "Connect everything",
              desc: "Paste a read-only key and Mizan backfills up to 3 months of usage automatically.",
            },
            {
              icon: BarChart2,
              title: "See it clearly",
              desc: "Unified spend by model, day, and provider — plus effective $/1M token comparisons.",
            },
            {
              icon: Bell,
              title: "Stay in budget",
              desc: "Set per-provider budgets and get email alerts before you overspend.",
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-xl border border-zinc-100 p-5">
              <Icon className="h-5 w-5 text-zinc-400" strokeWidth={1.5} />
              <p className="mt-3 text-sm font-medium text-zinc-900">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">{desc}</p>
            </div>
          ))}
        </div>

        {/* Trust row */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-zinc-400">
          {["Keys encrypted AES-256-GCM", "Read-only access", "Daily aggregates only"].map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <Check className="h-3 w-3 text-emerald-500" /> {t}
            </span>
          ))}
        </div>
      </main>

      <footer className="border-t border-zinc-100 px-6 py-6 text-center text-xs text-zinc-400 md:px-10">
        © {new Date().getFullYear()} Mizan — Weigh your tokens.
      </footer>
    </div>
  )
}
