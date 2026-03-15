import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { createClient } from "@/utils/supabase/server"
import { redirect } from "next/navigation"
import { User, Clock, Shield, Zap } from "lucide-react"

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
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <User className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Profile
            </h1>
            <p className="text-muted-foreground">
              Manage your account settings
            </p>
          </div>
        </div>
      </div>

      <Card className="w-full max-w-lg glass-card">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <Avatar className="h-14 w-14 border-2 border-border/50">
              <AvatarImage src={user?.user_metadata?.avatar_url || "/placeholder.svg?height=56&width=56"} />
              <AvatarFallback className="bg-primary/10 text-primary font-bold text-lg">
                {user?.user_metadata.full_name?.charAt(0).toUpperCase() || user?.user_metadata.email.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold truncate">{user.user_metadata.full_name}</h3>
                  {user.user_metadata.email_verified && (
                    <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/20">
                      <Shield className="h-3 w-3 mr-1" />
                      Verified
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground truncate mt-0.5">{user.email}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                {user.app_metadata.provider && (
                  <Badge variant="secondary" className="text-xs">
                    {user.app_metadata.provider}
                  </Badge>
                )}
                <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-primary/20">
                  <Zap className="h-3 w-3 mr-1" />
                  Pro Plan
                </Badge>
              </div>

              <div className="flex items-center gap-1.5 text-sm text-muted-foreground pt-1 border-t border-border/50">
                <Clock className="h-3.5 w-3.5" />
                Last sign in: {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : 'N/A'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
