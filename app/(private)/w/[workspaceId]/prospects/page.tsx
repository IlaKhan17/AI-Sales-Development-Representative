import ProspectList from "@/components/ProspectList"
import { PageHeader } from "@/components/page-header"

export default async function ProspectsPage() {
  // Prospects are loaded client-side from the API (per-user); the old Redis
  // read here targeted a key that nothing ever wrote.
  const prospects: never[] = []

  return (
    <div className="space-y-8">
      <PageHeader
        title="Prospects"
        description="Quick searches outside a campaign. Pick a search to see who it found, or start a new one from a job description."
      />
      <ProspectList initialProspects={prospects} />
    </div>
  )
}
