import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { ClerkProvider } from "@clerk/nextjs"
import { shadcn } from "@clerk/ui/themes"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "sonner"
import { ThemeProvider } from "@/components/theme-provider"
import { IS_DEMO } from "@/lib/demo"
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
  const tree = (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="h-full font-sans antialiased" suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster position="bottom-right" toastOptions={{ className: "text-xs font-sans" }} />
        </ThemeProvider>
      </body>
    </html>
  )

  // Demo mode runs without Clerk entirely, so don't mount ClerkProvider (it would require keys and
  // its client components — UserButton, OrganizationSwitcher — are hidden in demo anyway).
  if (IS_DEMO) return tree

  return <ClerkProvider appearance={{ theme: shadcn }}>{tree}</ClerkProvider>
}
