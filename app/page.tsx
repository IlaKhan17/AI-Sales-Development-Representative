import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, Bot, BrainCircuit, Calendar, Mail, MessageSquare, Zap, Target, BarChart3, Clock, CheckCircle2, ChevronRight } from 'lucide-react'
import { createClient } from "@/utils/supabase/server"
import Header from "@/components/Header"

export default async function LandingPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const user = data.user

  return (
    <div className="flex flex-col">
      <Header user={user} />

      {/* Hero Section */}
      <section className="relative w-full pt-24 pb-20 md:pt-32 md:pb-28 overflow-hidden">
        {/* Subtle grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.3)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.3)_1px,transparent_1px)] bg-[size:4rem_4rem]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
        {/* Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/5 rounded-full blur-3xl" />

        <div className="relative max-w-4xl mx-auto px-4 md:px-6">
          <div className="flex flex-col items-center text-center space-y-8">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground">
              <Zap className="h-3.5 w-3.5 text-primary" />
              <span>AI-powered sales automation</span>
            </div>

            <div className="space-y-4">
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl text-foreground">
                Your sales pipeline,{" "}
                <span className="text-primary">on autopilot</span>
              </h1>
              <p className="mx-auto max-w-[640px] text-lg md:text-xl text-muted-foreground leading-relaxed">
                Davis finds your ideal prospects, researches them deeply, and sends personalized outreach that gets replies. All while you focus on closing.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button asChild size="lg" className="h-12 px-8 text-base">
                <Link href="/login">
                  Start for free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" className="h-12 px-8 text-base">
                <Link href="#how-it-works">See how it works</Link>
              </Button>
            </div>

            {/* Social proof */}
            <p className="text-sm text-muted-foreground pt-4">
              No credit card required. Set up in under 5 minutes.
            </p>
          </div>
        </div>
      </section>

      {/* Metrics bar */}
      <section className="w-full border-y border-border bg-card/50">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-10 md:py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-3xl font-semibold text-foreground">10x</div>
              <div className="text-sm text-muted-foreground mt-1">More prospects reached</div>
            </div>
            <div>
              <div className="text-3xl font-semibold text-foreground">3x</div>
              <div className="text-sm text-muted-foreground mt-1">Higher reply rates</div>
            </div>
            <div>
              <div className="text-3xl font-semibold text-foreground">80%</div>
              <div className="text-sm text-muted-foreground mt-1">Time saved on research</div>
            </div>
            <div>
              <div className="text-3xl font-semibold text-foreground">24/7</div>
              <div className="text-sm text-muted-foreground mt-1">Always prospecting</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="w-full py-20 md:py-28">
        <div className="max-w-5xl mx-auto px-4 md:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl text-foreground">
              Everything you need to close more deals
            </h2>
            <p className="mt-4 max-w-[600px] mx-auto text-muted-foreground text-lg">
              From lead discovery to meeting follow-ups, Davis handles the entire sales development workflow.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Target,
                title: "Smart Lead Discovery",
                description: "Scrapes LinkedIn and other platforms to find prospects that match your ideal customer profile.",
              },
              {
                icon: BrainCircuit,
                title: "Deep Research",
                description: "Analyzes posts, activity, and company data to identify pain points and buying signals.",
              },
              {
                icon: BarChart3,
                title: "Lead Scoring",
                description: "Ranks prospects by alignment score so you focus on the highest-value opportunities first.",
              },
              {
                icon: Mail,
                title: "Personalized Outreach",
                description: "Generates hyper-personalized emails using multi-stage AI workflows for each prospect.",
              },
              {
                icon: MessageSquare,
                title: "Reply Tracking",
                description: "Monitors responses, analyzes sentiment, and auto-generates contextual follow-ups.",
              },
              {
                icon: Calendar,
                title: "Meeting Intelligence",
                description: "Captures meeting notes, extracts action items, and builds a searchable knowledge base.",
              },
            ].map((feature, i) => (
              <div
                key={i}
                className="group rounded-xl border border-border bg-card p-6 transition-all hover:border-primary/30 hover:shadow-sm"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-base font-semibold text-foreground">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="w-full py-20 md:py-28 border-t border-border bg-card/30">
        <div className="max-w-5xl mx-auto px-4 md:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl text-foreground">
              How it works
            </h2>
            <p className="mt-4 max-w-[600px] mx-auto text-muted-foreground text-lg">
              Three steps to transform your sales pipeline
            </p>
          </div>

          <div className="grid gap-12 md:gap-8 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Define your ICP",
                description: "Tell Davis who you're looking for — industry, role, company size, and the problems you solve.",
                icon: Target,
              },
              {
                step: "02",
                title: "AI does the work",
                description: "Davis finds matching prospects, researches them, and drafts personalized outreach emails.",
                icon: Bot,
              },
              {
                step: "03",
                title: "You close deals",
                description: "Review AI-generated emails, track replies, and focus your time on conversations that convert.",
                icon: Zap,
              },
            ].map((item, i) => (
              <div key={i} className="relative flex flex-col">
                <div className="text-5xl font-bold text-border mb-4">{item.step}</div>
                <h3 className="text-xl font-semibold text-foreground">{item.title}</h3>
                <p className="mt-2 text-muted-foreground leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use cases / Who it's for */}
      <section className="w-full py-20 md:py-28 border-t border-border">
        <div className="max-w-5xl mx-auto px-4 md:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl text-foreground">
              Built for modern sales teams
            </h2>
            <p className="mt-4 max-w-[600px] mx-auto text-muted-foreground text-lg">
              Whether you are a founder doing your own outbound or managing an SDR team, Davis scales with you.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-8">
              <h3 className="text-lg font-semibold text-foreground mb-4">For founders & solo sellers</h3>
              <ul className="space-y-3">
                {[
                  "Stop spending hours on LinkedIn research",
                  "Send outreach that sounds like you, not a template",
                  "Never miss a follow-up again",
                  "Focus on product while Davis fills the pipeline",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-border bg-card p-8">
              <h3 className="text-lg font-semibold text-foreground mb-4">For sales teams</h3>
              <ul className="space-y-3">
                {[
                  "Scale outbound without scaling headcount",
                  "Consistent, high-quality messaging across the team",
                  "AI meeting notes keep everyone aligned",
                  "Built-in knowledge base for faster ramp-up",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="w-full py-20 md:py-28 border-t border-border">
        <div className="max-w-3xl mx-auto px-4 md:px-6 text-center">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl text-foreground">
            Start closing more deals today
          </h2>
          <p className="mt-4 max-w-[500px] mx-auto text-muted-foreground text-lg">
            Set up in minutes. No credit card required.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg" className="h-12 px-8 text-base">
              <Link href="/login">
                Get started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full border-t border-border py-8">
        <div className="max-w-5xl mx-auto px-4 md:px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Davis</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Built by{" "}
            <a href="mailto:mohdjamikhann@gmail.com" className="text-foreground hover:text-primary transition-colors">
              Mohd Jami
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}
