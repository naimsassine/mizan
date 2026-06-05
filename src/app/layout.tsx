import type { Metadata } from "next"
import { Geist } from "next/font/google"
import { ClerkProvider } from "@clerk/nextjs"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./globals.css"

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
})

export const metadata: Metadata = {
  title: "Mizan — Weigh your tokens",
  description: "Track and control your AI spend across all providers.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${geist.variable} h-full`}>
        <body className="h-full bg-white font-sans antialiased">
          <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}
