import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { ClerkProvider } from "@clerk/nextjs"
import { shadcn } from "@clerk/ui/themes"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./globals.css"

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
})

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: "Mizan — Weigh your tokens",
  description: "Track and control your AI spend across all providers.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider appearance={{ theme: shadcn }}>
      <html lang="en" className={`${geist.variable} ${geistMono.variable} h-full`}>
        <body className="h-full font-sans antialiased">
          <TooltipProvider>{children}</TooltipProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}
