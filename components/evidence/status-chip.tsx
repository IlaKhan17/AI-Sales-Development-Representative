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

const STATUS_TONES: Record<ProspectV2Status, string> = {
  discovered:
    'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 border-sky-200 dark:border-sky-900',
  researching:
    'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300 border-violet-200 dark:border-violet-900',
  scored:
    'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-900',
  qualified:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900',
  needs_review:
    'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-900',
  insufficient_evidence: 'bg-muted text-muted-foreground border-border',
  disqualified:
    'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border-red-200 dark:border-red-900',
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
