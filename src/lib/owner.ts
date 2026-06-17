import { auth } from "@clerk/nextjs/server"
import { IS_DEMO, DEMO_OWNER_ID } from "@/lib/demo"

export type OwnerContext = {
  userId: string | null
  orgId: string | null
  orgRole: string | null
  /** org id when acting as an org, otherwise the user id. Null when signed out. */
  ownerId: string | null
  ownerType: "user" | "org"
  isDemo: boolean
}

/**
 * Resolve the current owner for the request.
 *
 * In demo mode this short-circuits Clerk completely and returns a fixed demo workspace identity, so
 * every page renders the seeded dummy data with no sign-in required. Otherwise it wraps Clerk's
 * `auth()` and derives `ownerId`/`ownerType` exactly the way every call site used to inline it
 * (`ownerId = orgId ?? userId`, org takes precedence).
 *
 * The returned object is a superset of the fields Clerk's `auth()` exposes that the app uses
 * (`userId`, `orgId`, `orgRole`), so `await auth()` can be replaced with `await getOwner()` at any
 * existing call site without changing the destructuring.
 */
export async function getOwner(): Promise<OwnerContext> {
  if (IS_DEMO) {
    return {
      userId: DEMO_OWNER_ID,
      orgId: null,
      orgRole: null,
      ownerId: DEMO_OWNER_ID,
      ownerType: "user",
      isDemo: true,
    }
  }

  const { userId, orgId, orgRole } = await auth()
  return {
    userId: userId ?? null,
    orgId: orgId ?? null,
    orgRole: orgRole ?? null,
    ownerId: orgId ?? userId ?? null,
    ownerType: orgId ? "org" : "user",
    isDemo: false,
  }
}
