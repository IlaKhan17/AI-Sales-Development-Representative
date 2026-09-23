import Link from "next/link"
import { Button } from "@/components/ui/button"
import { createClient } from "@/utils/supabase/server"
import Header from "@/components/Header"
import { ScoreBreakdown } from "@/components/evidence/score-breakdown"
import { ClaimCard } from "@/components/evidence/claim-card"
import type { EvidenceClaim, ProspectScore } from "@/lib/api-types"

// Sample dossier shown in the hero. It is rendered with the same components
// the app uses, so what visitors see is what they get.
const SAMPLE_SCORE: ProspectScore = {
  total: 81.7,
  status: "qualified",
  component_scores: {
    role: { points: 30, max: 30, reason: "VP Finance matches a target role" },
    industry: { points: 20, max: 20, reason: "SaaS is in the target industries" },
    company_size: { points: 15, max: 15, reason: "250 people, inside the 50 to 1,000 range" },
    technology: { points: 6.7, max: 10, reason: "Uses 2 of 3 target tools: NetSuite, Stripe" },
  },
}

const SAMPLE_SOURCE: EvidenceClaim = {
  id: "sample",
  claim: "Team page, Ledgerly",
  source_url: "https://ledgerly.example.com/team",
  evidence_snippet:
    "Maya Chen is VP Finance at Ledgerly, a 250-person Series B SaaS company. Ledgerly runs on NetSuite and Stripe, and the finance team is hiring two senior accountants.",
  confidence: 0.8,
}

const STEPS = [
  {
    title: "Find",
    body: "Davis searches the web and startup directories for people who match your ideal customer.",
  },
  {
    title: "Quote",
    body: "Every fact it keeps comes with the page it was found on, the exact words, and a confidence level.",
  },
  {
    title: "Score",
    body: "Fixed rules turn those facts into a score. The same evidence always gives the same number.",
  },
  {
    title: "Draft",
    body: "Emails are written only from claims your team has approved about your product.",
  },
  {
    title: "Approve",
    body: "You read, edit, and approve each email. Only then is it sent from your own Gmail.",
  },
]

const WONT = [
  {
    rule: "Send an email you haven't approved.",
    how: "Every draft waits in a queue. Approving is the only thing that sends.",
  },
  {
    rule: "Invent a claim about your product.",
    how: "Drafts may only use claims your team approved, and are checked for anything on your disallowed list.",
  },
  {
    rule: "Score a lead it can't back up.",
    how: "Facts without a source are dropped. A lead with too little evidence is marked as such, not guessed.",
  },
  {
    rule: "Email someone who opted out.",
    how: "Unsubscribes are suppressed automatically and checked again at the moment of sending.",
  },
  {
    rule: "Go past your daily limit or send twice.",
    how: "A send cap and duplicate check run on every approval.",
  },
]

export default async function LandingPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const user = data.user
  const primaryHref = user ? "/workspaces" : "/login"
  const primaryLabel = user ? "Open Davis" : "Start a workspace"

  return (
    <div className="flex flex-col">
      <Header user={user} />

      <section className="px-4 pb-20 pt-12 md:px-8 md:pt-20">
        <div className="mx-auto grid max-w-6xl items-start gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
          <div className="lg:pt-10">
            <h1 className="text-5xl font-bold leading-[1.02] tracking-tight md:text-6xl lg:text-7xl">
              Outbound you can check.
            </h1>
            <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-muted-foreground">
              Davis finds prospects, quotes the source behind every score, and drafts emails that
              wait for your approval. Nothing reaches a buyer until you say so.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="h-11 px-6 text-base">
                <Link href={primaryHref}>{primaryLabel}</Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-11 px-6 text-base">
                <Link href="#how-it-works">How a lead is scored</Link>
              </Button>
            </div>
          </div>

          <div aria-label="Example prospect dossier" className="space-y-3">
            <div className="flex items-baseline justify-between gap-3 px-1">
              <p className="text-sm">
                <span className="font-semibold">Maya Chen</span>
                <span className="text-muted-foreground">, VP Finance at Ledgerly</span>
              </p>
              <span className="rounded-full border border-approve/30 bg-approve/10 px-2 py-0.5 text-xs font-medium text-approve">
                Qualified
              </span>
            </div>
            <ScoreBreakdown
              score={SAMPLE_SCORE}
              citations={{ role: [1], industry: [1], company_size: [1], technology: [1] }}
            />
            <ClaimCard claim={SAMPLE_SOURCE} number={1} />
          </div>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-16 border-t border-border bg-card px-4 py-20 md:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="max-w-2xl text-3xl font-bold tracking-tight md:text-4xl">
            From search to sent, with a person at the end
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Davis does the searching, reading and drafting. The decision to send stays with you.
          </p>
          <ol className="mt-12 grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((step, i) => (
              <li key={step.title} className="bg-card p-5">
                <span className="text-sm font-semibold text-muted-foreground">{i + 1}</span>
                <h3 className="mt-6 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-t border-border px-4 py-20 md:px-8">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-16">
          <div>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">What Davis will not do</h2>
            <p className="mt-3 text-muted-foreground">
              These are enforced in code, not left to the model&apos;s judgement.
            </p>
          </div>
          <ul className="divide-y divide-border border-y border-border">
            {WONT.map((item) => (
              <li key={item.rule} className="grid gap-1 py-5 sm:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] sm:gap-8">
                <p className="font-semibold">{item.rule}</p>
                <p className="text-sm leading-relaxed text-muted-foreground">{item.how}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-t border-border bg-primary px-4 py-16 text-primary-foreground md:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl">Run your first campaign</h2>
            <p className="mt-2 max-w-xl text-primary-foreground/75">
              Describe your product, define who you sell to, connect Gmail, and start a campaign.
            </p>
          </div>
          <Button asChild size="lg" variant="secondary" className="h-11 px-6 text-base">
            <Link href={primaryHref}>{primaryLabel}</Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border px-4 py-8 md:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-2 text-sm md:flex-row md:items-center">
          <span className="font-bold">Davis</span>
          <p className="text-muted-foreground">
            Built by{" "}
            <a href="mailto:ila.rehman.khan@gmail.com" className="text-foreground underline underline-offset-2">
              Ila Rehman
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}
