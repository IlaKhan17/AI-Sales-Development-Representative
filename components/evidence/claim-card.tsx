import { formatDistanceToNow } from 'date-fns';
import { ExternalLink } from 'lucide-react';

import type { EvidenceClaim } from '@/lib/api-types';
import { Card, CardContent } from '@/components/ui/card';
import { ConfidenceBadge } from '@/components/evidence/confidence-badge';

export function ClaimCard({ claim }: { claim: EvidenceClaim }) {
  const observed = claim.observed_at ? new Date(claim.observed_at) : null;
  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium leading-relaxed">{claim.claim}</p>
          <ConfidenceBadge confidence={claim.confidence} />
        </div>
        {claim.evidence_snippet && (
          <blockquote className="border-l-2 border-primary/40 pl-3 text-sm italic text-muted-foreground">
            &ldquo;{claim.evidence_snippet}&rdquo;
          </blockquote>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {claim.source_url && (
            <a
              href={claim.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              {claim.source_title || claim.source_url}
            </a>
          )}
          {!claim.source_url && claim.source_title && (
            <span>{claim.source_title}</span>
          )}
          {observed && !Number.isNaN(observed.getTime()) && (
            <span>
              Observed {formatDistanceToNow(observed, { addSuffix: true })}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
