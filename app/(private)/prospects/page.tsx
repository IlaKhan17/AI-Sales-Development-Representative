import ProspectList from "@/components/ProspectList"
import redis from "@/utils/redis"
import { Users } from 'lucide-react'

export default async function ProspectsPage() {
  const cachedProspects = await redis.get("atlan_prospects")
  const prospects = JSON.parse(cachedProspects || '[]')

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Prospects
            </h1>
            <p className="text-muted-foreground">
              Manage your leads and find new opportunities
            </p>
          </div>
        </div>
      </div>
      <ProspectList initialProspects={prospects} />
    </div>
  )
}

