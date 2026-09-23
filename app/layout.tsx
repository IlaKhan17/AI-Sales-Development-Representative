import type React from "react"
import type { Metadata } from "next"
import { Newsreader, Schibsted_Grotesk } from 'next/font/google'
import "./globals.css"
import { createClient } from "@/utils/supabase/server"
import Header from "@/components/Header"
import { Toaster } from "sonner"

// UI voice: a newsroom grotesk. Serif is reserved for words that come from
// outside the app: cited evidence and the email letters awaiting approval.
const sans = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-sans" })
const serif = Newsreader({ subsets: ["latin"], variable: "--font-serif", style: ["normal", "italic"] })

export const metadata: Metadata = {
  title: "Davis",
  description: "Davis finds prospects, cites the evidence behind every score, and drafts outreach that waits for your approval.",
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const user = data.user

  return (
    <html lang="en" className="h-full">
      <body className={`${sans.variable} ${serif.variable} font-sans flex min-h-full flex-col antialiased bg-background text-foreground selection:bg-highlight/60`}>
        {/* Pages render their own <main>; a wrapper here would nest two. */}
        <div className="flex-1">
          {children}
        </div>
        <Toaster position="top-right" />
      </body>
    </html>
  )
}
