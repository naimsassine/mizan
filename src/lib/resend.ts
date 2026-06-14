import { Resend } from "resend"

// Lazily construct the client so importing this module (e.g. during Next's
// build-time page-data collection) never throws when RESEND_API_KEY is unset.
let client: Resend | null = null

export function getResend(): Resend {
  if (!client) {
    client = new Resend(process.env.RESEND_API_KEY)
  }
  return client
}
