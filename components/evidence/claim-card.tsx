import { formatDistanceToNow } from 'date-fns';

import type { EvidenceClaim } from '@/lib/api-types';
import { ConfidenceBadge } from '@/components/evidence/confidence-badge';

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * A numbered source: the quoted snippet as it appeared, where it came from,
 * and how much the scorer trusted it. Citations elsewhere link to #source-N.
 */
export function ClaimCard({ claim, number }: { claim: EvidenceClaim; number?: number }) {
  const observed = claim.observed_at ? new Date(claim.observed_at) : null;
  return (
    <article
      id={number ? `source-${number}` : undefined}
      className="scroll-mt-24 rounded-md border border-border bg-card p-4 target:border-foreground target:ring-2 target:ring-highlight"
    >
      <div className="flex items-baseline gap-2">
        {number !== undefined && (
          <span className="text-sm font-semibold text-foreground">[{number}]</span>
        )}
        <p className="flex-1 text-sm text-muted-foreground">{claim.claim}</p>
      </div>
      {claim.evidence_snippet && (
        <blockquote className="evidence-quote mt-3">
          <span className="evidence-mark">{claim.evidence_snippet}</span>
        </blockquote>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {claim.source_url ? (
          <a
            href={claim.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
          >
            {hostOf(claim.source_url)}
          </a>
        ) : (
          claim.source_title && <span>{claim.source_title}</span>
        )}
        {observed && !Number.isNaN(observed.getTime()) && (
          <span>Seen {formatDistanceToNow(observed, { addSuffix: true })}</span>
        )}
        <span className="ml-auto">
          <ConfidenceBadge confidence={claim.confidence} />
        </span>
      </div>
    </article>
  );
}
