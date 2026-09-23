import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Prospect } from "./ProspectModal"
import { cn } from "@/lib/utils"
import { Building2, User, AtSign, CheckCircle2, HelpCircle, Brain } from "lucide-react"

type ProspectCardProps = {
  prospect: Prospect
  onClick: () => void
}

const sourceColors: Record<string, string> = {
  "Product Hunt": "bg-caution/10 text-caution border-caution/30",
  "G2": "bg-hold/10 text-hold border-hold/30",
  "Hacker News Hiring": "bg-caution/10 text-caution border-caution/30",
  "GitHub": "bg-muted text-muted-foreground border-border",
  "Crunchbase": "bg-muted text-foreground border-border",
  "Wellfound": "bg-approve/10 text-approve border-approve/30",
  "YC Directory": "bg-caution/10 text-caution border-caution/30",
  "AngelList": "bg-muted text-muted-foreground border-border",
  "LinkedIn": "bg-muted text-foreground border-border",
  "Google": "bg-approve/10 text-approve border-approve/30",
  "Reddit": "bg-hold/10 text-hold border-hold/30",
}

export default function ProspectCard({ prospect, onClick }: ProspectCardProps) {
  const alignmentScore = prospect.alignment_score * 100
  const displayName = prospect.name || prospect.author
  const sourceBadgeClass = prospect.source
    ? (sourceColors[prospect.source] || "bg-muted text-muted-foreground border-border")
    : ""

  const emailVerified = prospect.email_confidence === "verified"
  const emailLikely = prospect.email_confidence === "likely"
  const hasEmail = !!prospect.email

  return (
    <Card
      className={cn(
        "glass-card cursor-pointer group transition-colors hover:border-foreground/40 relative overflow-hidden",
        prospect.isProspect ? "border-border" : ""
      )}
      onClick={onClick}
    >

      <CardHeader className="pb-3 relative z-10">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0">
            <h3 className="font-semibold text-base leading-tight line-clamp-2">
              {displayName}
            </h3>
            <div className="flex items-center text-sm text-muted-foreground gap-1.5">
              <User className="h-3.5 w-3.5 shrink-0" />
              <p className="line-clamp-2">{prospect.role}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {prospect.source && (
              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", sourceBadgeClass)}>
                {prospect.source}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="relative z-10 space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-2 rounded-md">
          <Building2 className="h-4 w-4 shrink-0" />
          <p className="font-medium text-foreground line-clamp-2">{prospect.company}</p>
        </div>

        {/* Email indicator */}
        {hasEmail && (
          <div className={cn(
            "flex items-center gap-2 text-xs px-2 py-1.5 rounded-md border",
            emailVerified ? "bg-approve/10 text-approve border-approve/30"
              : emailLikely ? "bg-muted text-foreground border-border"
                : "bg-muted/50 text-muted-foreground border-border"
          )}>
            {emailVerified || emailLikely
              ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              : <HelpCircle className="h-3.5 w-3.5 shrink-0" />
            }
            <AtSign className="h-3 w-3 shrink-0 -ml-1" />
            <span className="truncate">{prospect.email}</span>
            <span className="ml-auto shrink-0 opacity-70">
              {emailVerified ? "Verified" : emailLikely ? "Likely" : "Unsure"}
            </span>
          </div>
        )}

        {/* Match Score */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-medium">Match score</span>
            <span className={cn(
              "font-bold",
              alignmentScore >= 80 ? "text-approve" : alignmentScore >= 50 ? "text-caution" : "text-muted-foreground"
            )}>
              {alignmentScore.toFixed(0)}%
            </span>
          </div>
          <Progress
            value={alignmentScore}
            className="h-2"
            indicatorClassName={cn(
              alignmentScore >= 80 ? "bg-approve" : alignmentScore >= 50 ? "bg-caution" : "bg-muted-foreground"
            )}
          />
        </div>

        <div className="pt-1 border-t border-border space-y-1.5">
          <p className="text-xs text-muted-foreground line-clamp-1 italic">
            {prospect.industry}
          </p>
          {prospect.selection_reasoning && (
            <div className="flex items-start gap-1.5">
              <Brain className="h-3 w-3 text-primary/60 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                {prospect.selection_reasoning}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
