import { cn } from '@/lib/utils';
import type { CampaignStatus } from '@/lib/api-types';

const TONES: Record<CampaignStatus, string> = {
  draft: 'bg-transparent text-muted-foreground border-dashed border-border',
  running: 'bg-approve/10 text-approve border-approve/30',
  paused: 'bg-caution/10 text-caution border-caution/30',
  completed: 'bg-card text-foreground border-border',
  failed: 'bg-hold/10 text-hold border-hold/30',
};

export function CampaignStatusBadge({
  status,
  className,
}: {
  status: CampaignStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize',
        TONES[status] ?? TONES.draft,
        className
      )}
    >
      {status === 'running' && (
        <span className="mr-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-approve" />
      )}
      {status}
    </span>
  );
}
