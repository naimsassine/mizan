# Mizan — Codebase Analysis

> Snapshot analysis of the current state: potential bugs, missing features, and UX/UI improvements. No code was changed.

## How the app works today (summary)

- **Auth**: Clerk (`src/proxy.ts` middleware); personal or org workspace, `ownerId = orgId ?? userId` everywhere.
- **Connections**: user pastes API keys (encrypted AES-256-GCM in `enc_credentials`); `createConnection` kicks off a backfill via `after()`; Vercel cron (`/api/cron/sync`, daily 06:00 UTC) runs incremental "yesterday-only" syncs for all active connections, rescans email inboxes, checks budget rules, and sends weekly digests.
- **10 providers**: OpenAI (Admin API + legacy fallback), Anthropic, Gemini/Vertex (OAuth + Cloud Monitoring), Bedrock (Cost Explorer, hand-rolled SigV4), Groq (Prometheus metrics), Mistral, Grok, Kimi, OpenRouter, LiteLLM. Most use hardcoded per-1M-token pricing tables.
- **Receipts**: Gmail/Outlook OAuth scan → Claude Haiku parses emails; PDF/image upload → Claude Sonnet; manual entry. Split into `api` vs `subscription` usage types.
- **Dashboards**: Overview (MTD, forecast, chart, model breakdown), Usage (tables + CSV export), Compare ($/1M tokens), Connections, Receipts, Notifications (budget rules, alert history, anomalies, weekly digest), Settings.

---

## 1. Potential bugs

### Critical / data-correctness

1. **Errored connections can never recover via the "Sync" button** — the connections page tells users "Use the sync button to retry", but `triggerSync` (`src/app/(dashboard)/connections/actions.ts:70`) calls the `*Incremental` variants, and **every** incremental sync bails immediately when `connection.status !== "active"` (e.g. `src/lib/sync/openai.ts:230`). An errored connection's only recovery is delete + re-add. The retry path should call the full `sync*()` instead (or incremental should not gate on status).

2. **Provider pricing prefix-match picks the *first* match, not the *longest*** — `modelPrice()` in `openai.ts:49` (and the same pattern in anthropic/groq/grok/kimi) iterates `Object.entries(PRICING)` and returns on the first `startsWith` hit. Example: a future `"o1-mini-2025-xx"` matches key `"o1"` ($15/$60) before `"o1-mini"` ($3/$12) → **5× cost overstatement**. Same for `"gpt-4.1-nano-…"` matching `"gpt-4.1"`. Fix: sort keys by length descending before matching.

3. **Several provider integrations appear to hit non-existent endpoints and fail silently or hard**:
   - **Anthropic** (`src/lib/sync/anthropic.ts:61`): `GET https://api.anthropic.com/v1/usage?start_date=…` — Anthropic's real usage API is the Admin "usage report" endpoint (`/v1/organizations/usage_report/messages`, admin key, `starting_at`/`bucket_width` params). A 404 here throws → connection immediately marked `error/failed`. **Anthropic connections likely never work.**
   - **Mistral** (`mistral.ts:56`), **Grok** (`grok.ts:48`), **Kimi** (`kimi.ts:46`): speculative `/v1/billing/usage`-style endpoints; 404 is swallowed (`return []`) so the connection is marked **active + complete with zero data** — user thinks it works, sees nothing, no error surfaced.
   - **OpenAI legacy fallback** (`openai.ts:137`): `GET /v1/usage?date=` is deprecated for plain API keys; `if (!res.ok) continue` skips every day silently → again "active, complete, no data".
   - **OpenRouter** (`openrouter.ts:28`): `/api/v1/generation` with `date_min/date_max` should be verified against the current API (today's listing endpoint is `/api/v1/activity`).
   - Recommendation: verify each endpoint against current provider docs, and **distinguish "no data" from "endpoint unsupported"** in the UI.

4. **Daily cron only syncs *yesterday* — any missed cron run loses that day forever** (`/api/cron/sync` → `sync*Incremental(yesterday)`). One failed/timed-out cron, a deploy at 06:00, or a provider outage leaves a permanent hole with no catch-up. Incremental syncs should look back a window (e.g. 3–7 days); upserts already make this idempotent.

5. **Backfill runs inside `after()` in a serverless function and will hit execution limits** — `syncOpenAI`/`syncGroq`/etc. loop ~90 sequential HTTP calls (one per day) plus one DB upsert per record. On Vercel this will frequently be killed mid-flight → connection stuck in `in_progress` forever, and `SyncPoller` then **refreshes the page every 4 s indefinitely** (no timeout/stall detection). Needs a queue (the roadmap's BullMQ), chunked backfill, or at minimum `maxDuration` + a stale-backfill watchdog. Same risk applies to the cron route itself (syncs + email scans + digests in one invocation, no `maxDuration` set).

6. **Budget alerts ignore receipt/subscription spend and receipt-only users** — `checkBudgetAlerts` (`src/app/api/cron/sync/route.ts:73`) aggregates only `usageRecord`; receipts (incl. subscriptions shown in the dashboard totals) never count toward budgets. Also `ownerIds` is derived only from *active provider connections*, so an owner with only an email connection (receipts) or whose connections are all in `error` never gets budget checks.

7. **Potential double-counting of spend: API receipts + API polling** — an OpenAI invoice email parsed as `usageType: "api"` is added to overview/usage totals *on top of* the same spend already synced via the OpenAI usage API. The app warns about OpenRouter/LiteLLM double-counting but not this. Needs overlap detection (same provider + overlapping billing period) or an explicit "counted/not counted" toggle per receipt.

8. **`createConnection` ignores the backfill-months setting** — hardcodes `subMonths(new Date(), 3)` (`connections/actions.ts:43`) even though Settings promises "control how far back Mizan fetches when you connect a new provider" and the GCP OAuth callback *does* read `userSettings.backfillMonths`. Also: the GCP callback reads **user** settings even when connecting as an **org** (should read `OrgSettings`).

### Security

9. **OAuth `state` is forgeable (no nonce/signature)** — state is just `base64url(JSON{userId, orgId})` (`api/auth/gmail/route.ts:9`, gcp, outlook). The callback only checks `state.userId === session.userId`, and anyone can construct that value. An attacker can mint an authorization code for *their own* Gmail/GCP account and get a victim to visit the callback URL → attacker's mailbox gets connected to the victim's workspace (data injection / tracking). Standard fix: random nonce stored in an HttpOnly cookie (or signed state) verified at callback.
10. **`state.orgId` is ignored at the callback** — the connection is created under the *current session's* org; if the user switched workspaces mid-flow the connection lands in the wrong owner.
11. **No role enforcement inside org workspaces** — every org member can add/delete connections, delete receipts, change budget rules, etc. CLAUDE.md specifies admin/member/viewer roles; nothing checks them.
12. **`uploadReceipt` is an uncapped LLM-spend vector** — any signed-in user can repeatedly POST 9 MB PDFs that go straight to Claude Sonnet (`src/lib/parse-file-receipt.ts`), burning your `ANTHROPIC_API_KEY` budget. No rate limiting anywhere on server actions.
13. **CSV export lacks formula-injection guards** — model names are quote-escaped but values beginning with `=`, `+`, `-`, `@` should be prefixed when opened in Excel (`api/usage/export/route.ts:36`).
14. **`saveBackfillMonths` doesn't validate the value** (any int accepted if called directly), and `saveDigestSettings` doesn't validate provider strings. `zod` is in package.json but unused.

### Logic / smaller bugs

15. **Usage page + CSV export only know 5 of the 10 providers** — `VALID_PROVIDERS` in `usage/page.tsx:32` and `api/usage/export/route.ts:8` omit mistral, grok, kimi, openrouter, litellm → no filter chips for them, the export filter silently falls back to "all", and `providerColors`/`providerLabel` on that page miss them (unstyled badges). Settings' provider-history-limits info box also lists only 5.
16. **Weekly digest compares a *partial* current week to a full prior week** (`src/lib/send-weekly-digest.ts:169`) — if the user's digest day is Monday, "this week" is ~0–1 days of data and the email reads "−85% vs last week". The digest should report the *completed* week vs the week before.
17. **Dead-code conditionals: `status: isCredErr ? "error" : "error"`** in `bedrock.ts:215`, and identical `isAuthError ? "error" : "error"` in mistral/grok/kimi — presumably one branch was meant to be `"expired"` (openrouter/litellm do it correctly).
18. **Date/timezone fragility around `@db.Date`** — sync code mixes `startOfDay(new Date(...))` (server-local) and `new Date("yyyy-MM-dd")` (UTC midnight) when building the `(connectionId, date, model)` unique key (e.g. `vertex.ts:198` vs `openai.ts:106`). On a non-UTC server this can split one day into two records or collide adjacent days. Pick one convention (UTC date strings) everywhere.
19. **Disconnect + reconnect an email account ⇒ duplicate receipts** — `disconnectEmailAccount` deletes the `EmailConnection`; `Receipt.emailConnectionId` is `SetNull`, so the dedupe lookup (`src/lib/scan-emails.ts:58`, scoped to the *new* connection id) no longer sees previously imported `externalId`s and re-imports everything.
20. **Anomaly detection compares consecutive *recorded* days, not calendar days** (`notifications/page.tsx:126`) — a quiet Saturday followed by a normal Monday is flagged as a 2× spike. Also anomalies are display-only (never emailed/alerted).
21. **Receipt date filtering is approximate** — overview pulls `take: 500` receipts then filters in JS (`overview/page.tsx:58`); beyond 500 receipts last-month comparisons go wrong. A monthly subscription is also lumped onto a single chart day (its `billingPeriodStart`), producing a misleading spike rather than amortizing.
22. **Org-owned data invisible in the weekly digest** — digest queries `ownerType: "user"` only; users who do all their work inside an org get an empty digest (and digest settings are hidden for orgs, so org admins can't enable one at all). Decide and make it consistent.
23. **`OrganizationSwitcher hidePersonal`** (`sidebar.tsx:108`) — once a user joins any org they can't switch back to their personal workspace, yet the whole data model supports personal mode.
24. **Vertex sync quirks** — `priceFor()` silently returns `$0` for unknown Gemini models (no warning, unlike other providers, and the table is missing newer models); `endDate = subDays(now, 0)` is a no-op; bucketing by `point.interval.endTime` can assign a day-aligned bucket to the *next* day depending on alignment.
25. **Bedrock records have cost but zero tokens** → they're filtered out of the Compare page (`totalTokens > 0`) and skew "tokens this month" downward. Expected with Cost Explorer, but worth surfacing ("cost-only source") rather than silently excluding. Bedrock region selection is also collected in the dialog but Cost Explorer is hardcoded to `us-east-1` (fine — CE is global — so the region field is dead weight).
26. **Mistral fuzzy price match is too loose** — `key.includes(model.split(":")[0])` (`mistral.ts:29`) lets short/odd model strings match unrelated keys.
27. **Greeting and digest-day use server time** — "Good morning" is computed with the server's clock (`overview/page.tsx:198`); `weeklyDigestDay` compares against UTC day. No user timezone anywhere.
28. **No Prisma migrations directory** — schema-only; presumably `db push`. Fine for solo dev, but there's no migration history for production.
29. **Profile/OrgProfile tables are never written** — no Clerk webhook creates rows; the tables are dead schema right now. Also nothing deletes a user's data when the Clerk user/org is deleted (GDPR).

### Dark mode (visual bugs)

30. **The dark theme is a global-CSS override layer (`globals.css:121`) re-coloring hardcoded utility classes** — clever, but it produces concrete breakage:
    - `.dark .text-white { color: dark }` + unoverridden `hover:bg-zinc-700` ⇒ primary buttons ("Add connection", "Connect", "Add rule") flip to **dark text on dark background on hover**.
    - Recharts hardcoded hexes: `fill: #18181b` bars and `#f4f4f5` cursor (`spend-chart.tsx:93`), sparkline/compare charts likely the same ⇒ near-invisible bars on dark cards.
    - Pastel provider badges (`bg-emerald-50 text-emerald-700` etc.) keep light-mode colors ⇒ low contrast in dark.
    - Long-term fix: migrate pages to the semantic tokens that already exist in the CSS vars (`bg-card`, `text-foreground`, `text-muted-foreground`) and theme charts via `var(--chart-*)`.

---

## 2. Features still to build

### Roadmap items (from CLAUDE.md) not yet present
- **Forward-to-email receipt inbox** (`receipts+{token}@mizan.app` via SES/Resend inbound) — Phase 3's flagship ingestion path.
- **Clerk webhooks** → create/delete `Profile`/`OrgProfile`, clean up data on user/org deletion, sync org membership.
- **Background job queue** (BullMQ + Upstash per the plan, or Vercel Queues/Inngest) for backfills and cron fan-out — fixes bugs #4/#5 properly.
- **Phase 4: budget caps per team, cost-center tagging, Expensify/Brex export.**
- **Pricing tiers / Stripe billing** (Free/Pro/Team/Enterprise table exists in CLAUDE.md).

### Data & integrations
- **Central pricing service** — replace 6 hardcoded pricing tables with one module, ideally refreshed from a live source (OpenRouter `/models`, LiteLLM's `model_prices_and_context_window.json`), with an "unpriced models" surface in the UI instead of silent `$0`.
- **More providers**: Azure OpenAI, Cohere, Together, Fireworks, DeepSeek, Vercel AI Gateway, Replicate; per-project OpenAI breakdown (`group_by[]=project_id`).
- **Cache/reasoning token tracking** — cached-input and reasoning tokens have different prices and are already in most providers' usage payloads (`rawPayload` keeps them; the schema doesn't).
- **Catch-up & re-backfill**: "Extend history" button (use the backfill-months setting!), sync-last-N-days incremental, manual full re-sync.
- **Credential rotation** — edit an existing connection's key instead of delete/re-add (delete cascades and destroys history).
- **Receipt file storage** (Vercel Blob/S3) so uploaded PDFs/images can be re-viewed; currently only `[file: name]` is kept.
- **Receipt ↔ API overlap detection** (see bug #7) with an "excluded from totals" flag.
- **Multi-currency receipts** (EUR invoices from Mistral are real) with FX normalization.

### Alerts & reporting
- **100%-of-budget follow-up alert** (currently only the single threshold-% alert per period).
- **Anomaly alerts by email/Slack**, not just an in-app card; webhook/Slack/Discord notification channels.
- **Org-level digests** and digests for org owners; monthly summary email.
- **Budget line overlay** on the spend chart; forecast-vs-budget warnings ("on pace to exceed $X by the 23rd").
- **Scheduled CSV exports / public read API** with API keys.

### Product
- **Per-user attribution within an org** (proxy mode — already an open question in CLAUDE.md).
- **Demo/sample-data mode** for first-run experience and screenshots.
- **Audit log** for org actions (connections added/deleted, rules changed).
- **Custom date ranges** (currently fixed 7/30/90 and 30/90/365/all).

---

## 3. UX/UI improvements

### High impact
1. **Fix dark mode properly** (see bug #30) — semantic tokens + chart CSS vars; audit every hover state.
2. **Make failure states honest** — connections that synced zero records currently show "active". Show "Connected — no usage data found", distinguish auth errors vs unsupported endpoints vs empty accounts, and surface backfill progress ("synced 42/90 days").
3. **Toasts on success/failure** — sonner is installed but most actions (add connection, create rule, reclassify, sync) give no feedback beyond a dialog closing.
4. **Delete-connection dialog must warn that usage history is deleted** (cascade).
5. **Usage table pagination/virtualization + day grouping** — 90 days × N models renders unbounded rows; group by date with subtotals, paginate.
6. **Add the 5 missing providers to the Usage filter chips and export** (bug #15) so the filter UI matches what users can connect.

### Polish
7. Provider logos/icons on connection cards and badges instead of color-only coding.
8. Overview "vs last month" should compare **same-day-of-month** (MTD vs last-month-to-same-day), not MTD vs the full month — currently always shows a huge negative early in the month.
9. Forecast: naive daily average over-/under-shoots with weekday seasonality; at least show it as a range and exclude today (partial day).
10. Receipts list: "{n} total" is wrong when truncated at `take: 100`; paginate; add provider/date filters and a detail view (raw content, source email).
11. Spend chart: option to stack **by provider** (color per provider), a 7-day moving-average line, and amortize subscription amounts across their billing period instead of a one-day spike.
12. Compare page: blended $/1M is fine, but show input/output split per model and label Bedrock's exclusion.
13. Accessibility: `text-zinc-400` on white fails WCAG AA for small text in many places; sortable table headers aren't keyboard-accessible (`onClick` on `<th>`); icon-only buttons need `aria-label`s; add visible focus rings.
14. Mobile: tables rely on horizontal scroll — consider card layouts for usage rows; the sidebar hover-expand has no keyboard/touch equivalent for labels.
15. Restore the personal workspace in the org switcher (bug #23) or explain its absence.
16. Settings: hide the disabled "Export preferences — coming soon" card or move it to a roadmap link; the provider-limits info box should list all 10 providers.
17. Empty states: Compare/Usage with one provider or zero data could link directly to "Add connection"; first-run onboarding checklist could persist progress.
18. Greeting/timezone: use the client's timezone (small client component) for the greeting and "Updated X ago".
19. Command palette (`cmd+k`) for navigation; keyboard shortcuts for range switching.
20. Landing page: `/` redirects straight to sign-in — a minimal marketing/landing page would help unauthenticated visitors understand the product.

---

## Suggested priority order (if you start fixing)

1. Verify/fix provider endpoints (Anthropic first — likely fully broken), and make zero-data syncs visible. (bugs #3, UX #2)
2. Fix retry-sync on errored connections + incremental look-back window. (bugs #1, #4)
3. Move backfill off `after()` onto a queue or chunked processing. (bug #5)
4. Longest-prefix pricing match + central pricing module. (bug #2)
5. OAuth state nonce. (bug #9)
6. Budget alerts covering receipts + checks for receipt-only owners. (bug #6)
7. Dark-mode/token migration. (bug #30)
