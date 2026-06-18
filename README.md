<div align="center">

# ⚖️ Mizan

### **Weigh your tokens.**

One dashboard to rule all your AI costs — track, aggregate, and control your spend across **every** provider.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Postgres](https://img.shields.io/badge/Postgres-Neon-336791?logo=postgresql&logoColor=white)](https://neon.tech/)
[![Clerk](https://img.shields.io/badge/Auth-Clerk-6C47FF?logo=clerk&logoColor=white)](https://clerk.com/)
[![Tailwind](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

</div>

---

## 🧭 What is Mizan?

> **Mizan** (ميزان) — Arabic for *"scale / balance"*. The thing you weigh things on.

You're spending money on AI across OpenAI, Anthropic, Gemini, Bedrock, Groq, and a dozen API gateways. Each has its own billing dashboard, its own login, its own export format. Nobody knows what the **total** is until the credit card statement lands.

**Mizan sits between you and your providers** and gives you one clean dashboard: what you're spending, on which models, by whom, and where it's heading. 📉

```
┌───────────────────────────────────────────────────────────────────┐
│                                                                     │
│   OpenAI ─┐                                                         │
│ Anthropic ─┤                            ┌──────────────────────┐    │
│   Gemini ─┤      🔑 encrypted keys      │   ⚖️  MIZAN           │    │
│  Bedrock ─┤  ──────────────────────►    │                      │    │
│     Groq ─┤      📥 daily polling       │  • unified spend     │    │
│  Mistral ─┤      🧾 receipt scanning    │  • per-model break-  │    │
│     Grok ─┤                             │    down + forecast   │    │
│OpenRouter ─┤                            │  • budgets & alerts  │    │
│  LiteLLM ─┘                             │  • CSV export        │    │
│                                         └──────────────────────┘    │
│                                                   │                 │
│                                                   ▼                 │
│                                          😌  one number you trust   │
└───────────────────────────────────────────────────────────────────┘
```

---

## ✨ Features

| | Feature | What it does |
|---|---|---|
| 📊 | **Unified dashboard** | MTD spend, month forecast, spend-over-time chart, and per-model breakdown across all providers |
| 🔌 | **9 provider integrations** | OpenAI, Anthropic, Gemini/Vertex, AWS Bedrock, Groq, Mistral, Grok, OpenRouter, LiteLLM |
| 🔐 | **Encrypted key vault** | Provider API keys stored **AES-256-GCM** encrypted at rest, per-connection — never logged, never returned |
| ⏪ | **Auto-backfill** | On connect, Mizan pulls your last **3 months** (configurable) of usage automatically |
| 🔁 | **Daily sync** | A nightly cron polls every active connection for fresh usage — idempotent, with a lookback window |
| 🧾 | **Receipt ingestion** | Scan Gmail/Outlook or upload a PDF/image — Claude parses the provider, amount, date & invoice ID |
| 🚨 | **Budgets & alerts** | Per-provider / per-period spend caps with threshold alerts by email + anomaly detection |
| ⚖️ | **Model comparison** | $/1M-token cost comparison across every model you actually use |
| 📤 | **CSV export** | Export filtered usage for finance / expensing |
| 👥 | **Teams built-in** | Personal **and** org workspaces from day one (Clerk orgs + roles) |
| 📧 | **Weekly digest** | Opt-in weekly spend summary email |
| 🌓 | **Light / dark mode** | Clean, Midday.ai-inspired UI on shadcn/ui |
| 🧪 | **Read-only demo mode** | Ship a public, seeded, no-login demo from the same codebase — [see below](#-demo-mode) |

---

## 🏗️ Architecture

Mizan is a single **Next.js 16 (App Router)** app — server components read the DB directly, Server Actions handle mutations, and a Vercel cron drives the nightly sync. No separate backend.

```
                  ┌──────────────────────── Next.js 16 (App Router) ─────────────────────────┐
                  │                                                                           │
 Browser  ──────► │  proxy.ts (Clerk middleware)                                              │
                  │        │                                                                  │
                  │        ▼                                                                  │
                  │   (dashboard)/ pages ──── server components ──► getOwner() ──► Prisma      │
                  │   overview · usage · compare · connections · receipts ·         │         │
                  │   notifications · settings                                      ▼         │
                  │        │                                                  ┌───────────┐   │
                  │   Server Actions (actions.ts) ──── encrypt() ───────────► │           │   │
                  │        │                                                  │   Neon    │   │
                  │        └── after() ──► provider sync ──┐                  │  Postgres │   │
                  │                                        │                  │           │   │
 Vercel Cron ───► │  /api/cron/sync (daily 06:00 UTC) ─────┼──► lib/sync/*.ts │           │   │
 (0 6 * * *)      │     • incremental usage sync           │      (9 prov.)   └───────────┘   │
                  │     • email receipt rescan             │                                  │
                  │     • budget alert checks ─── Resend ──┘                                  │
                  │     • weekly digests                                                      │
                  └───────────────────────────────────────────────────────────────────────────┘
```

### 🧱 Tech stack

| Layer | Choice | Why |
|---|---|---|
| **Framework** | Next.js 16 · React 19 · TypeScript | Full-stack, SSR dashboards, Server Actions — no separate API layer |
| **UI** | Tailwind 4 · shadcn/ui · Recharts · lucide | Clean monochrome Midday.ai aesthetic out of the box |
| **Auth** | Clerk | Orgs, invites, roles built in — saves weeks of multi-tenancy work |
| **DB** | PostgreSQL (Neon) + Prisma 7 | Serverless Postgres, Vercel-native, typed ORM + migrations |
| **Email** | Resend | Alerts, weekly digests, onboarding |
| **AI parsing** | Claude (Haiku for email, Sonnet for files) | Receipt extraction |
| **Hosting** | Vercel | Frontend + API routes + cron in one deploy |

### 🔑 Key design decisions

- **Ownership model** — every row is keyed on `ownerId = orgId ?? userId` (`src/lib/owner.ts`). One seam (`getOwner()`) powers personal workspaces, org workspaces, **and** demo mode.
- **Daily aggregates, not per-request** — matches what provider billing APIs actually expose. Unique key `(connection_id, date, model)` makes every sync idempotent.
- **Encryption baseline** — keys are AES-256-GCM encrypted per-connection (`src/lib/encrypt.ts`); plaintext never touches the DB or logs.
- **Per-owner cache tags** — dashboard aggregates are cached and busted per owner on every write (`src/lib/cache.ts`).

---

## 🗂️ Project layout

```
mizan/
├── prisma/
│   ├── schema.prisma          # data model (connections, usage, receipts, budgets, settings)
│   ├── migrations/            # migration history
│   └── seed-demo.ts           # ≈90 days of deterministic demo data
├── src/
│   ├── proxy.ts               # Clerk middleware (pass-through in demo mode)
│   ├── app/
│   │   ├── (dashboard)/       # overview · usage · compare · connections ·
│   │   │                      #   receipts · notifications · settings
│   │   │                      #   (each: page.tsx + actions.ts + loading.tsx)
│   │   └── api/
│   │       ├── cron/sync/     # nightly sync + alerts + digests
│   │       ├── auth/          # Gmail / Outlook / GCP OAuth callbacks
│   │       └── usage/export/  # CSV export
│   ├── lib/
│   │   ├── sync/              # one file per provider (9) — sync + incremental
│   │   ├── owner.ts           # ownerId resolution (the multi-tenancy seam)
│   │   ├── encrypt.ts         # AES-256-GCM
│   │   ├── cache.ts           # per-owner cache tags
│   │   ├── parse-receipt.ts   # Claude email parsing
│   │   ├── parse-file-receipt.ts  # Claude PDF/image parsing
│   │   └── demo.ts            # demo-mode flag + constants
│   └── components/            # UI grouped by feature (dashboard, connections, receipts, …)
└── vercel.json                # cron schedule
```

---

## 🚀 Getting started

### Prerequisites
- **Node 20+**
- A **Postgres** database ([Neon](https://neon.tech) recommended)
- A **[Clerk](https://clerk.com)** application (free tier is fine)

### 1. Install

```bash
git clone https://github.com/naimsassine/mizan.git
cd mizan
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in `.env` — at minimum:

| Var | Where to get it |
|---|---|
| `DATABASE_URL` / `DIRECT_URL` | [neon.tech](https://neon.tech) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | [dashboard.clerk.com](https://dashboard.clerk.com) |
| `ENCRYPTION_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `CRON_SECRET` | any random string (protects the cron route) |
| `ANTHROPIC_API_KEY` | for receipt parsing *(optional)* |
| `RESEND_API_KEY` / `EMAIL_FROM` | for alert + digest emails *(optional)* |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | for Gmail/GCP OAuth *(optional)* |

### 3. Set up the database

```bash
npx prisma migrate deploy   # apply schema
npx prisma generate         # generate the typed client
```

### 4. Run it

```bash
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)** → sign up → connect a provider → watch the backfill roll in. 🎉

---

## 🧪 Demo mode

Mizan can run as a **public, read-only demo** — no sign-in, no real keys, just seeded sample data. Same codebase, flipped by one env var.

```bash
# 1. Point DATABASE_URL at a (dedicated) demo DB and apply the schema
npx prisma migrate deploy

# 2. Seed ≈90 days of usage across 4 providers + receipts + budgets + an alert
npm run seed:demo

# 3. Launch in demo mode (Clerk is bypassed entirely)
NEXT_PUBLIC_DEMO_MODE=true npm run dev
```

In demo mode: **no auth**, every request resolves to one fixed `demo-workspace`, and **all mutations are disabled** (sync, OAuth, email scan, edits, cron all short-circuit). Browsing is fully live. Reseeding is idempotent and deterministic. Full details in **[DEMO.md](./DEMO.md)**.

---

## 🗺️ Roadmap

- [x] **Phase 1 — Foundation:** Clerk auth + orgs · OpenAI connection · backfill · spend dashboard · alerting
- [x] **Phase 2 — Multi-provider:** Anthropic · Gemini/Vertex · Bedrock · Groq · Mistral · Grok · OpenRouter · LiteLLM · unified dashboard
- [x] **Phase 3 — Receipts:** Gmail/Outlook OAuth scan · PDF/image upload · Claude-assisted parsing
- [ ] **Phase 3+ —** Forward-to-email inbox (`receipts+{token}@mizan.app`)
- [ ] **Phase 4 — Teams:** budget caps per team · cost-center tagging · Expensify/Brex export · per-user attribution

See [CLAUDE.md](./CLAUDE.md) for the full product spec, data model, and decision log.

---

## 🔒 Security

- 🔐 Provider API keys: **AES-256-GCM** encrypted at rest, per-connection — never logged, never returned via API
- 🧱 Every DB query is scoped by `owner_id` (row-level isolation per user/org)
- 🪪 Clerk JWT verified on every request via middleware
- ⏰ The cron route is protected by a `CRON_SECRET` bearer token

Found a vulnerability? Please open a security advisory rather than a public issue.

---

## 🤝 Contributing

Issues and PRs welcome! A couple of house rules:

- ⚠️ **This is Next.js 16** — APIs and conventions differ from older versions. Check `node_modules/next/dist/docs/` before reaching for muscle memory (see [AGENTS.md](./AGENTS.md)).
- Never commit secrets — `.env*` and `.claude/settings.local.json` are gitignored for a reason.
- Keep the ownership model intact: read through `getOwner()`, scope every query by `ownerId`.

---

<div align="center">

**⚖️ Mizan** — *weigh your tokens.*

Built with Next.js, Prisma, and a healthy fear of the monthly AI bill.

</div>
