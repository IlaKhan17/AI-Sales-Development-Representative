import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { PageHeader } from "@/components/page-header"
import { createClient } from "@/utils/supabase/server"
import { redirect } from "next/navigation"

interface ProfileSectionProps {
  user?: {
    name: string
    email: string
    avatar_url?: string
    provider?: string
    status?: "online" | "offline"
    email_verified?: boolean
    last_sign_in_at?: string
  }
}

export default async function ProfileSection() {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    if (!data.user) {
        redirect('/login')
    }
    const user = data.user

    return (
    <div className="space-y-8">
      <PageHeader title="Profile" description="The account you sign in with." />

      <dl className="max-w-xl divide-y divide-border rounded-md border border-border bg-card">
        <div className="flex items-center gap-4 px-5 py-4">
          <Avatar className="h-12 w-12 border border-border">
            <AvatarImage src={user?.user_metadata?.avatar_url || undefined} />
            <AvatarFallback className="bg-background text-foreground font-semibold">
              {(user?.user_metadata?.full_name || user?.email || '?').charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-semibold">{user.user_metadata?.full_name || user.email}</p>
            {user.user_metadata?.full_name && (
              <p className="truncate text-sm text-muted-foreground">{user.email}</p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-[9rem_1fr] gap-4 px-5 py-3 text-sm">
          <dt className="text-muted-foreground">Signed in with</dt>
          <dd className="capitalize">{user.app_metadata.provider ?? 'email'}</dd>
        </div>
        <div className="grid grid-cols-[9rem_1fr] gap-4 px-5 py-3 text-sm">
          <dt className="text-muted-foreground">Email</dt>
          <dd>{user.email_confirmed_at || user.user_metadata?.email_verified ? 'Verified' : 'Not verified yet'}</dd>
        </div>
        <div className="grid grid-cols-[9rem_1fr] gap-4 px-5 py-3 text-sm">
          <dt className="text-muted-foreground">Last sign-in</dt>
          <dd>{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : 'Unknown'}</dd>
        </div>
      </dl>
    </div>
  )
}
