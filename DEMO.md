# Demo mode

Mizan can run as a **public, read-only demo** — no sign-in, no real API keys, just seeded sample
data for people to click around. It's the same codebase as production, toggled by one env var and
deployed separately against its own database.

## How it works

Demo mode is controlled by `NEXT_PUBLIC_DEMO_MODE=true`. When set:

- **No auth.** Clerk is bypassed entirely — `src/proxy.ts` becomes a pass-through and the root
  layout doesn't mount `ClerkProvider`. No Clerk keys are required.
- **One fixed workspace.** `getOwner()` (`src/lib/owner.ts`) resolves every request to a single
  owner, `DEMO_OWNER_ID` (`src/lib/demo.ts`), instead of calling Clerk. All reads are scoped to
  that owner, so the seeded data shows up everywhere with zero page changes.
- **Read-only.** Every mutating server action returns early with `DEMO_DISABLED`, and the
  external-calling routes (provider sync, Gmail/Outlook/GCP OAuth, email scan, the nightly cron)
  short-circuit before touching any third party. In the UI, mutating controls are disabled and show
  a "read-only demo" toast (`blockedInDemo()` in `src/lib/demo-client.ts`).
- **Browsing is fully live.** Overview, Usage, Compare, Receipts, Notifications, Settings and the
  CSV export all render/run against the seeded data.

The seam is small and self-contained: `src/lib/demo.ts`, `src/lib/owner.ts`,
`src/lib/demo-client.ts`, plus the per-call guards. Production is unaffected (`NEXT_PUBLIC_DEMO_MODE`
unset → `IS_DEMO` is `false` and every code path behaves exactly as before).

## Run it locally

```bash
# 1. Point DATABASE_URL at a database you can seed (ideally a dedicated demo DB).
#    Apply the schema if needed:  npx prisma migrate deploy

# 2. Seed the demo workspace (≈90 days of usage across 4 providers, receipts, budgets, an alert):
npm run seed:demo

# 3. Start in demo mode:
NEXT_PUBLIC_DEMO_MODE=true npm run dev
```

Visit `/` and you'll be dropped straight into `/overview` — no login.

Re-running `npm run seed:demo` is **idempotent**: it wipes the demo owner's rows and regenerates
them. The numbers are deterministic, so the demo looks identical after every reseed.

## Deploy it (separate Vercel project)

1. New Vercel project from the same repo.
2. Env vars: `NEXT_PUBLIC_DEMO_MODE=true` and `DATABASE_URL` (the demo DB). Nothing else is
   required — Clerk / `ENCRYPTION_KEY` / `RESEND_API_KEY` are unused in demo.
3. After the first deploy, seed the demo DB once: `npm run seed:demo` (locally with the demo
   `DATABASE_URL`, or as a one-off job).
4. Optional: schedule `npm run seed:demo` daily to reset any drift. (The app's own
   `/api/cron/sync` is a no-op in demo.)

> Keep `DEMO_OWNER_ID` in `src/lib/demo.ts` and `prisma/seed-demo.ts` in sync — they must match.
