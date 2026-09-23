import { cn } from '@/lib/utils';
import type { CampaignCounts, ProspectV2Status } from '@/lib/api-types';
import { PROSPECT_STATUS_LABELS } from '@/components/evidence/status-chip';

// Work in progress stays in graphite tones; only the three outcomes that ask
// something of a person get color.
const SEGMENTS: Array<{ key: ProspectV2Status; color: string }> = [
  { key: 'discovered', color: 'bg-muted-foreground/25' },
  { key: 'researching', color: 'bg-muted-foreground/40' },
  { key: 'scored', color: 'bg-muted-foreground/60' },
  { key: 'qualified', color: 'bg-approve' },
  { key: 'needs_review', color: 'bg-caution' },
  { key: 'insufficient_evidence', color: 'bg-border' },
  { key: 'disqualified', color: 'bg-hold' },
];

const TALLY: ProspectV2Status[] = ['qualified', 'needs_review', 'insufficient_evidence', 'disqualified'];

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
  const inProgress = (counts.discovered ?? 0) + (counts.researching ?? 0) + (counts.scored ?? 0);
  return (
    <div className={cn('space-y-4', className)}>
      {showLegend && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-5">
          {TALLY.map((key) => {
            const color = SEGMENTS.find((s) => s.key === key)!.color;
            return (
              <div key={key}>
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={cn('h-2 w-2 rounded-sm', color)} />
                  {PROSPECT_STATUS_LABELS[key]}
                </dt>
                <dd className="text-2xl font-bold tracking-tight">{counts[key] ?? 0}</dd>
              </div>
            );
          })}
          <div>
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-sm bg-muted-foreground/40" />
              Still researching
            </dt>
            <dd className="text-2xl font-bold tracking-tight">{inProgress}</dd>
          </div>
        </dl>
      )}
      <div
        className="flex h-2 w-full gap-px overflow-hidden rounded-sm bg-muted"
        role="img"
        aria-label={SEGMENTS.map((s) => `${PROSPECT_STATUS_LABELS[s.key]} ${counts[s.key] ?? 0}`).join(', ')}
      >
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
    </div>
  );
}
