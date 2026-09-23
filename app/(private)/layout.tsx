import type React from "react"
import type { Metadata } from "next"
import { createClient } from "@/utils/supabase/server"
import { redirect } from "next/navigation"
import { AppSidebar } from "@/components/app-sidebar"
import { QueryProvider } from "@/components/providers/query-provider"

export const metadata: Metadata = {
  title: "Davis",
  description: "Evidence-backed prospecting and approval-first outreach.",
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  const user = data.user
  if (!user) {
    redirect('/login')
  }
  return (
    <QueryProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <AppSidebar user={user} />
        <main className="flex-1 overflow-y-auto lg:ml-64">
          <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-16 md:px-8 lg:pt-10">
            {children}
          </div>
        </main>
      </div>
    </QueryProvider>
  )
}

