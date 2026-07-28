import { cn } from '@/lib/utils';
import type { CampaignCounts, ProspectV2Status } from '@/lib/api-types';
import { PROSPECT_STATUS_LABELS } from '@/components/evidence/status-chip';

const SEGMENTS: Array<{ key: ProspectV2Status; color: string }> = [
  { key: 'discovered', color: 'bg-sky-400' },
  { key: 'researching', color: 'bg-violet-400' },
  { key: 'scored', color: 'bg-blue-400' },
  { key: 'qualified', color: 'bg-emerald-500' },
  { key: 'needs_review', color: 'bg-amber-400' },
  { key: 'insufficient_evidence', color: 'bg-slate-300 dark:bg-slate-600' },
  { key: 'disqualified', color: 'bg-red-400' },
];

export function campaignTotal(counts: CampaignCounts | undefined): number {
  if (!counts) return 0;
  return SEGMENTS.reduce((sum, s) => sum + (counts[s.key] ?? 0), 0);
}

/**
 * Simple horizontal segmented funnel bar with legend. No chart library.
 */
export function CampaignFunnel({
  counts,
  showLegend = true,
  className,
}: {
  counts: CampaignCounts;
  showLegend?: boolean;
  className?: string;
}) {
  const total = campaignTotal(counts);
  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {total > 0 &&
          SEGMENTS.map(({ key, color }) => {
            const value = counts[key] ?? 0;
            if (value <= 0) return null;
            return (
              <div
                key={key}
                className={color}
                style={{ width: `${(value / total) * 100}%` }}
                title={`${PROSPECT_STATUS_LABELS[key]}: ${value}`}
              />
            );
          })}
      </div>
      {showLegend && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          {SEGMENTS.map(({ key, color }) => (
            <span key={key} className="inline-flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-full', color)} />
              {PROSPECT_STATUS_LABELS[key]}
              <span className="font-medium tabular-nums text-foreground">
                {counts[key] ?? 0}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
