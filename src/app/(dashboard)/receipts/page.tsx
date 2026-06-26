import { redirect } from "next/navigation"

// Receipts were merged into the Connections page (API Spend tab). Keep this route alive so old
// links/bookmarks land in the right place.
export default function ReceiptsPage() {
  redirect("/connections")
}
