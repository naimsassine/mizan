@AGENTS.md

# Mizan
**Tagline**: Weigh your tokens

A webapp where individuals and companies track, aggregate, and control their AI spend across all providers — OpenAI, Anthropic, Gemini, Bedrock, and more.

---

## Vision

One dashboard to rule all AI costs. Mizan sits between users/companies and their AI providers, giving them clarity on what they're spending, where, and by whom.

---

## Design Reference

Midday.ai — clean white, icon-only left sidebar, card grid layout, minimal color palette (mostly monochromatic), dark data visualizations, spacious typography.
Stack: shadcn/ui default theme gets us 90% there out of the box.

---

## Core Features (Roadmap Priority Order)

### Phase 1 — Foundation
- [ ] Auth via Clerk (email/password + Google OAuth, org model built-in)
- [ ] Personal workspace + team org switching (Clerk handles this)
- [ ] OpenAI API key connection + daily usage polling
- [ ] 3-month backfill on connection (configurable in settings)
- [ ] Spend dashboard: total, by model, by day/week/month
- [ ] Basic alerting (spend threshold notifications)

### Phase 2 — Multi-provider
- [ ] Anthropic API key connection
- [ ] Google Gemini / Vertex AI connection (OAuth + Cloud Billing API)
- [ ] AWS Bedrock connection (IAM read-only credentials)
- [ ] Unified cross-provider dashboard

### Phase 3 — Receipt Ingestion
- [ ] Forward-to-email inbox (unique address per user, e.g. `receipts+abc123@mizan.app`)
- [ ] PDF/image manual upload
- [ ] Receipt parsing (LLM-assisted extraction: provider, amount, date, invoice ID)
- [ ] Gmail/Outlook OAuth auto-scan (later)

### Phase 4 — Teams & Companies
- [ ] Budget caps per provider / per team
- [ ] Cost center tagging (map usage to projects or departments)
- [ ] CSV + expense tool export (Expensify, Brex, etc.)

---

## Ingestion Strategies

### 1. API Key Connection (primary)
- User pastes their provider API key (read-only/billing scope where available)
- Mizan polls usage endpoints on a **daily schedule** — daily aggregates only (no per-request data)
- On first connection: backfill last **3 months** automatically; user can request more in Settings
- Keys stored encrypted at rest (AES-256-GCM, per-connection encryption key)
- Alert user when key is invalid/expired

**Provider endpoints:**
| Provider | Endpoint | Auth |
|---|---|---|
| OpenAI | `GET /v1/usage` + Admin Key for orgs | API key |
| Anthropic | `GET /v1/usage` (workspace-level) | API key |
| Gemini/Vertex | Cloud Monitoring API + Billing Export | Google OAuth |
| AWS Bedrock | Cost Explorer API | IAM read-only |

### 2. Forward-to-Email (receipt fallback — Phase 3)
- Each user gets a unique inbox: `receipts+{token}@mizan.app`
- User adds a Gmail/Outlook filter to auto-forward billing emails
- Incoming email → parse with regex/LLM → extract: provider, amount, date, invoice ID

### 3. Manual Upload (Phase 3)
- PDF or image receipt upload, parsed via LLM

---

## Data Model (Finalized)

### Auth & Identity — managed by Clerk
Clerk owns: User, Organization, OrgMembership, roles (admin | member | viewer), invite flows.
Our DB stores only what Clerk doesn't: preferences, settings, extended profile.

```
Profile                          -- extends Clerk user, one row per Clerk user_id
  clerk_user_id   TEXT PK        -- Clerk's user ID, used as FK everywhere
  created_at      TIMESTAMPTZ

OrgProfile                       -- extends Clerk org, one row per Clerk org_id
  clerk_org_id    TEXT PK
  created_at      TIMESTAMPTZ
```

### Connections
```
ProviderConnection
  id              UUID PK
  owner_id        TEXT           -- Clerk user_id OR Clerk org_id
  owner_type      ENUM(user, org)
  provider        ENUM(openai, anthropic, gemini, bedrock)
  enc_credentials TEXT           -- AES-256-GCM encrypted JSON (API key etc.)
  status          ENUM(active, error, expired)
  last_synced_at  TIMESTAMPTZ
  backfill_from   DATE           -- default: today - 3 months; user can set earlier in Settings
  backfill_status ENUM(pending, in_progress, complete, failed)
  created_at      TIMESTAMPTZ
```

### Usage (daily aggregates)
```
UsageRecord
  id              UUID PK
  connection_id   UUID FK → ProviderConnection
  owner_id        TEXT           -- denormalized for fast queries
  owner_type      ENUM(user, org)
  date            DATE           -- daily granularity
  provider        ENUM(openai, anthropic, gemini, bedrock)
  model           TEXT           -- e.g. "gpt-4o", "claude-3-5-sonnet"
  input_tokens    BIGINT
  output_tokens   BIGINT
  cost_usd        NUMERIC(12,6)
  source          ENUM(api_poll, receipt_email, receipt_upload)
  raw_payload     JSONB          -- original API response, for debugging/reprocessing

  UNIQUE (connection_id, date, model)  -- prevent duplicate polling
```

### Receipts (Phase 3 — schema defined now, built later)
```
Receipt
  id                    UUID PK
  owner_id              TEXT
  owner_type            ENUM(user, org)
  provider              TEXT
  amount_usd            NUMERIC(10,2)
  billing_period_start  DATE
  billing_period_end    DATE
  invoice_id            TEXT
  source                ENUM(email_forward, manual_upload)
  parsed_at             TIMESTAMPTZ
  raw_content           TEXT
```

### Budgets & Alerts
```
BudgetRule
  id            UUID PK
  owner_id      TEXT
  owner_type    ENUM(user, org)
  provider      TEXT NULLABLE   -- null = all providers
  period        ENUM(daily, weekly, monthly)
  limit_usd     NUMERIC(10,2)
  alert_at_pct  INT             -- e.g. 80 = alert at 80% of budget

Alert
  id              UUID PK
  budget_rule_id  UUID FK → BudgetRule
  triggered_at    TIMESTAMPTZ
  spend_usd       NUMERIC(10,2)
  acknowledged_at TIMESTAMPTZ NULLABLE
```

### Settings
```
UserSettings
  clerk_user_id         TEXT PK
  backfill_months       INT DEFAULT 3    -- how far back to sync on new connection
  notification_email    BOOLEAN DEFAULT true

OrgSettings
  clerk_org_id          TEXT PK
  backfill_months       INT DEFAULT 3
```

---

## Tech Stack

### Frontend
- **Next.js 15** (App Router) — full-stack, SSR for dashboard pages
- **TypeScript** throughout
- **Tailwind CSS** + **shadcn/ui** — Midday-style clean UI
- **Recharts** — spend charts (bar, line, area)

### Backend
- **Next.js Server Actions** — data fetching + mutations (clean, no extra layer needed)
- **Prisma** — ORM + migrations
- **PostgreSQL** via **Neon** — serverless managed Postgres, works well with Vercel
- **BullMQ + Upstash Redis** — background jobs for usage polling + backfill
- **Resend** — transactional email (alerts, onboarding)

### Auth
- **Clerk** — auth, org management, invites, roles. Handles everything.

### Infrastructure
- **Vercel** — hosting (frontend + API routes + cron triggers)
- **Neon** — managed Postgres
- **Upstash Redis** — serverless Redis for BullMQ
- **AWS SES** (Phase 3) — inbound email for receipt forwarding

### Security
- API keys: AES-256-GCM encrypted, per-connection key, never logged, never returned via API
- Row-level security on all DB queries (always filter by owner_id = current user/org)
- Clerk JWT verified on every Server Action / API route

---

## Pricing Model (to consider later)

| Tier | Target | Features |
|---|---|---|
| Free | Individuals | 1 provider, 3-month history |
| Pro ($12/mo) | Power users | All providers, unlimited history, alerts |
| Team ($8/seat/mo) | Small teams | Org dashboard, budgets, team view |
| Enterprise | Companies | SSO, audit logs, SLA, custom integrations |

---

## Key Decisions Made

| Decision | Choice | Reason |
|---|---|---|
| Auth | **Clerk** | Built-in org model, invites, roles — saves weeks |
| Usage granularity | **Daily aggregates** | Matches provider billing APIs; per-request needs a proxy |
| Team attribution | **Org-level totals only** | Simple to start; per-user needs proxy (Phase 4+) |
| Backfill default | **3 months** | Sensible default; user can request more in Settings |
| DB | **Neon (Postgres)** | Serverless, Vercel-native, Prisma support |
| Jobs | **BullMQ + Upstash** | Reliable queue for polling + backfill jobs |
| Design ref | **Midday.ai** | Clean, minimal, techy — shadcn/ui default theme |
| Org model | **From day one** | Retrofitting multi-tenancy is too painful |
| Key storage | **AES-256-GCM encrypted** | Non-negotiable security baseline |
| API layer | **Server Actions** | Simpler than tRPC for Phase 1; add tRPC later if needed |

---

## Open Questions (deferred)

- [ ] OpenAI "project"-level billing vs. org-level key — how do we map these?
- [ ] Anthropic: connect per-workspace or per-account?
- [ ] GDPR / data residency for EU enterprise customers
- [ ] API proxy mode for per-user attribution within a shared org key (Phase 4)
