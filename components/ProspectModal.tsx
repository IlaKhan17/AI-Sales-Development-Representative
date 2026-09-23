"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Loader2, Mail, Building2, Globe, Sparkles, AlertCircle, Quote, AtSign, CheckCircle2, HelpCircle, XCircle, ExternalLink, ShieldCheck, ShieldX, Brain } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { apiFetch } from "@/lib/api"
import type { DraftEmailResponse } from "@/lib/api-types"
import EmailDraftModal from "./EmailDrafts"
import { cn } from "@/lib/utils"

export type EmailCandidate = {
  address: string
  pattern: string
  pattern_rank: number
  confidence: "verified" | "likely" | "unverifiable" | "invalid" | "unknown"
  smtp_code?: number
  note?: string
}

export type ICPScoreBreakdown = {
  role_match: number
  industry_match: number
  company_fit: number
  pain_point_signals: number
}

export type Prospect = {
  author: string
  name?: string
  role: string
  company: string
  isProspect: boolean
  alignment_score: number
  industry: string
  pain_points: string[]
  solution_fit: string
  insights: string
  // Lead quality & reasoning
  selection_reasoning?: string
  icp_score_breakdown?: ICPScoreBreakdown
  disqualification_signals?: string[]
  // Contact discovery
  email?: string
  email_confidence?: "verified" | "likely" | "unverifiable" | "unknown"
  email_candidates?: EmailCandidate[]
  source?: string
  url?: string
}

type ProspectModalProps = {
  prospect: Prospect
  onClose: () => void
}

const confidenceConfig = {
  verified: { icon: CheckCircle2, color: "text-approve", label: "Verified", bg: "bg-approve/10 border-approve/30" },
  likely: { icon: CheckCircle2, color: "text-foreground", label: "Likely valid", bg: "bg-muted border-border" },
  unverifiable: { icon: HelpCircle, color: "text-caution", label: "Unverifiable", bg: "bg-caution/10 border-caution/30" },
  invalid: { icon: XCircle, color: "text-hold", label: "Invalid", bg: "bg-hold/10 border-hold/30" },
  unknown: { icon: HelpCircle, color: "text-muted-foreground", label: "Unknown", bg: "bg-muted/50 border-border" },
}

const sourceColors: Record<string, string> = {
  "Product Hunt": "bg-caution/10 text-caution border-caution/30",
  "G2": "bg-hold/10 text-hold border-hold/30",
  "Hacker News Hiring": "bg-caution/10 text-caution border-caution/30",
  "GitHub": "bg-muted text-muted-foreground border-border",
  "Crunchbase": "bg-muted text-foreground border-border",
  "Wellfound": "bg-approve/10 text-approve border-approve/30",
  "YC Directory": "bg-caution/10 text-caution border-caution/30",
  "AngelList": "bg-black/5 text-foreground border-border",
  "LinkedIn": "bg-muted text-foreground border-border",
  "Google": "bg-approve/10 text-approve border-approve/30",
  "Reddit": "bg-hold/10 text-hold border-hold/30",
}

export default function ProspectModal({ prospect, onClose }: ProspectModalProps) {
  const [showEmailDraft, setShowEmailDraft] = useState(false)
  const [emailDraft, setEmailDraft] = useState<{ subject: string; content: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [showAllEmails, setShowAllEmails] = useState(false)

  const displayName = prospect.name || prospect.author
  const primaryEmail = prospect.email
  const emailConf = prospect.email_confidence || "unknown"
  const confConfig = confidenceConfig[emailConf] || confidenceConfig.unknown
  const ConfIcon = confConfig.icon
  const sourceBadgeClass = prospect.source ? (sourceColors[prospect.source] || "bg-muted text-muted-foreground border-border") : ""

  const handleGenerateEmailDraft = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<DraftEmailResponse>('/draft-emails', {
        method: 'POST',
        body: prospect,
      })
      setEmailDraft(data.email)
      setShowEmailDraft(true)
    } catch (error) {
      console.error("Error generating email draft:", error)
    } finally {
      setLoading(false)
    }
  }

  const alignmentScore = prospect.alignment_score * 100

  return (
    <>
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[720px] glass-card border-primary/10 overflow-hidden p-0 gap-0">
          <div className="absolute top-0 left-0 w-full h-0.5 bg-primary/30" />

          {/* Header */}
          <DialogHeader className="p-6 pb-4 flex-row items-start justify-between space-y-0">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-3 flex-wrap">
                <DialogTitle className="text-2xl font-bold">{displayName}</DialogTitle>
                <Badge variant={prospect.isProspect ? "default" : "secondary"} className={cn(
                  "text-xs px-2 py-0.5",
                  prospect.isProspect ? "bg-muted text-primary hover:bg-primary/30" : ""
                )}>
                  {prospect.isProspect ? "High Intent" : "Lead"}
                </Badge>
                {prospect.source && (
                  <Badge variant="outline" className={cn("text-xs px-2 py-0.5", sourceBadgeClass)}>
                    {prospect.source}
                  </Badge>
                )}
              </div>
              <DialogDescription className="text-base flex items-center gap-2 flex-wrap">
                <span className="font-medium text-foreground">{prospect.role}</span>
                <span className="text-muted-foreground">at</span>
                <span className="font-medium text-foreground flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  {prospect.company}
                </span>
                {prospect.url && (
                  <a
                    href={prospect.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center gap-1 text-sm"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-3 w-3" />
                    View Source
                  </a>
                )}
              </DialogDescription>
            </div>

            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="text-xs text-muted-foreground font-medium">Alignment</span>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-2xl font-bold",
                  alignmentScore >= 80 ? "text-approve" : alignmentScore >= 50 ? "text-caution" : "text-muted-foreground"
                )}>
                  {alignmentScore.toFixed(0)}%
                </span>
                <Progress value={alignmentScore} className="w-16 h-2" />
              </div>
            </div>
          </DialogHeader>

          {/* Body */}
          <div className="px-6 py-4 space-y-5 bg-card max-h-[60vh] overflow-y-auto">

            {/* Email Section */}
            {(primaryEmail || (prospect.email_candidates && prospect.email_candidates.length > 0)) && (
              <div className={cn("rounded-lg border p-3 space-y-2", confConfig.bg)}>
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <AtSign className="h-4 w-4" />
                    Discovered Email
                  </h4>
                  {prospect.email_candidates && prospect.email_candidates.length > 1 && (
                    <button
                      onClick={() => setShowAllEmails(!showAllEmails)}
                      className="text-xs text-primary hover:underline"
                    >
                      {showAllEmails ? "Hide" : `+${prospect.email_candidates.length} candidates`}
                    </button>
                  )}
                </div>
                {primaryEmail && (
                  <div className="flex items-center gap-2">
                    <ConfIcon className={cn("h-4 w-4 shrink-0", confConfig.color)} />
                    <code className="text-sm font-mono bg-background/60 px-2 py-0.5 rounded">{primaryEmail}</code>
                    <span className={cn("text-xs", confConfig.color)}>{confConfig.label}</span>
                    <a
                      href={`mailto:${primaryEmail}`}
                      className="ml-auto text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <Mail className="h-3 w-3" />
                      Open
                    </a>
                  </div>
                )}
                {showAllEmails && prospect.email_candidates && (
                  <div className="mt-2 space-y-1 border-t border-border pt-2">
                    {prospect.email_candidates.slice(0, 6).map((c, i) => {
                      const cfg = confidenceConfig[c.confidence] || confidenceConfig.unknown
                      const Icon = cfg.icon
                      return (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <Icon className={cn("h-3 w-3 shrink-0", cfg.color)} />
                          <code className="font-mono text-foreground/80">{c.address}</code>
                          <span className="text-muted-foreground ml-auto">{c.pattern}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Selection Reasoning */}
            {prospect.selection_reasoning && (
              <div className="rounded-lg border border-border bg-muted p-3 space-y-1.5">
                <h4 className="text-sm font-medium flex items-center gap-2 text-primary">
                  <Brain className="h-4 w-4" />
                  Why This Lead Was Selected
                </h4>
                <p className="text-sm leading-relaxed text-foreground/80">{prospect.selection_reasoning}</p>
              </div>
            )}

            {/* ICP Score Breakdown */}
            {prospect.icp_score_breakdown && Object.keys(prospect.icp_score_breakdown).length > 0 && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                  <ShieldCheck className="h-4 w-4" />
                  ICP Fit Breakdown
                </h4>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  {[
                    { key: "role_match", label: "Role Match" },
                    { key: "industry_match", label: "Industry" },
                    { key: "company_fit", label: "Company Fit" },
                    { key: "pain_point_signals", label: "Pain Point Signals" },
                  ].map(({ key, label }) => {
                    const val = (prospect.icp_score_breakdown as Record<string, number>)[key] ?? 0
                    const pct = Math.round(val * 100)
                    return (
                      <div key={key} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{label}</span>
                          <span className={cn(
                            "font-semibold",
                            pct >= 80 ? "text-approve" : pct >= 50 ? "text-caution" : "text-hold"
                          )}>{pct}%</span>
                        </div>
                        <Progress value={pct} className="h-1.5" />
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Disqualification Signals */}
            {prospect.disqualification_signals && prospect.disqualification_signals.length > 0 && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 space-y-1.5">
                <h4 className="text-sm font-medium flex items-center gap-2 text-destructive">
                  <ShieldX className="h-4 w-4" />
                  Disqualification Signals
                </h4>
                <div className="flex flex-wrap gap-2">
                  {prospect.disqualification_signals.map((signal, i) => (
                    <Badge key={i} variant="outline" className="text-xs border-destructive/30 text-destructive">
                      {signal}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Pain Points + Solution Fit + Insights */}
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Pain Points
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {(prospect.pain_points || []).map((point, index) => (
                      <Badge key={index} variant="outline" className="border-border bg-card font-normal text-foreground">
                        {point}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Solution Fit
                  </h4>
                  <p className="text-sm leading-relaxed bg-muted p-3 rounded-lg border border-primary/10">
                    {prospect.solution_fit}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Industry</h4>
                  <Badge variant="secondary" className="rounded-full px-3">{prospect.industry}</Badge>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                    <Quote className="h-4 w-4" />
                    AI Insights
                  </h4>
                  <p className="text-sm text-muted-foreground italic leading-relaxed bg-muted/50 p-3 rounded-lg">
                    "{prospect.insights}"
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="p-6 pt-4 bg-muted/20 border-t border-border flex flex-row justify-end items-center gap-2">
            {prospect.url && (
              <Button variant="outline" size="lg" asChild>
                <a href={prospect.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  View Profile
                </a>
              </Button>
            )}
            <Button
              onClick={handleGenerateEmailDraft}
              disabled={loading}
              className="w-full sm:w-auto"
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating Draft...
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Generate Personalized Email
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showEmailDraft && (
        <EmailDraftModal prospect={prospect} emailDraft={emailDraft} onClose={() => setShowEmailDraft(false)} />
      )}
    </>
  )
}
