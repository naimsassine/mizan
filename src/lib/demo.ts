// Demo mode — a public, read-only deployment of Mizan seeded with dummy data.
//
// When NEXT_PUBLIC_DEMO_MODE is "true", the app:
//   - skips Clerk entirely (no sign-in, no ClerkProvider, proxy is a pass-through)
//   - resolves every request to a single fixed demo workspace (see DEMO_OWNER_ID)
//   - blocks all mutating server actions and external-calling routes (syncs, OAuth, email, cron)
//
// This module is intentionally dependency-free so it can be imported from BOTH server and client
// components. NEXT_PUBLIC_DEMO_MODE is inlined at build time, so IS_DEMO is a constant everywhere.

/** True when this deployment is the read-only demo. */
export const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true"

/**
 * The owner id that all seeded demo data belongs to. In demo mode every request resolves to this
 * id (as a personal/user workspace), so the dashboard renders the seeded data with no auth.
 * Must match the ownerId used by prisma/seed-demo.ts.
 */
export const DEMO_OWNER_ID = "demo-workspace"

/**
 * Standard result returned by mutating server actions when they're blocked in demo mode.
 * Shape matches what every action already returns (`{ error: string | null }`), so callers that
 * surface `result.error` show this message unchanged.
 */
export const DEMO_DISABLED = {
  error: "This is a read-only demo — changes are disabled.",
} as const

/**
 * URL of the real (production) Mizan deployment. Shown as the "Access the real deal" button in the
 * demo banner. Set NEXT_PUBLIC_REAL_APP_URL on the demo deployment (and in local dev to test the
 * button). When empty the button is hidden.
 */
export const REAL_APP_URL =
  process.env.NEXT_PUBLIC_REAL_APP_URL ?? "https://mizan-pi-five.vercel.app"
