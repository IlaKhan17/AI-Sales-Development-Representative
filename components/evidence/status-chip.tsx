import { cn } from '@/lib/utils';
import type { ProspectV2Status } from '@/lib/api-types';

export const PROSPECT_STATUS_LABELS: Record<ProspectV2Status, string> = {
  discovered: 'Discovered',
  researching: 'Researching',
  scored: 'Scored',
  qualified: 'Qualified',
  needs_review: 'Needs review',
  insufficient_evidence: 'Insufficient evidence',
  disqualified: 'Disqualified',
};

// Two decisive outcomes get the approve/hold colors; states still in motion
// stay neutral ink so the eye lands on what needs a decision.
const STATUS_TONES: Record<ProspectV2Status, string> = {
  discovered: 'bg-card text-muted-foreground border-border',
  researching: 'bg-card text-muted-foreground border-border',
  scored: 'bg-card text-foreground border-border',
  qualified: 'bg-approve/10 text-approve border-approve/30',
  needs_review: 'bg-caution/10 text-caution border-caution/30',
  insufficient_evidence: 'bg-transparent text-muted-foreground border-dashed border-border',
  disqualified: 'bg-hold/10 text-hold border-hold/30',
};

/** Color-coded chip for a prospect pipeline status. */
export function StatusChip({
  status,
  className,
}: {
  status: ProspectV2Status | string;
  className?: string;
}) {
  const known = status in STATUS_TONES ? (status as ProspectV2Status) : null;
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium',
        known ? STATUS_TONES[known] : 'bg-muted text-muted-foreground border-border',
        className
      )}
    >
      {known ? PROSPECT_STATUS_LABELS[known] : status}
    </span>
  );
}
