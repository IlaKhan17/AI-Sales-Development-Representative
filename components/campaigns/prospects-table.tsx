'use client';

import Link from 'next/link';
import { RefreshCw, Users } from 'lucide-react';

import type { ProspectV2, ProspectV2Status } from '@/lib/api-types';
import { useWorkspace } from '@/components/providers/workspace-provider';
import {
  useProspectsV2,
  type ProspectsV2Filters,
} from '@/lib/hooks/use-prospects-v2';
import { StatusChip, PROSPECT_STATUS_LABELS } from '@/components/evidence/status-chip';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useState } from 'react';

const FILTER_TABS: Array<{ value: ProspectV2Status | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'qualified', label: PROSPECT_STATUS_LABELS.qualified },
  { value: 'needs_review', label: PROSPECT_STATUS_LABELS.needs_review },
  { value: 'scored', label: PROSPECT_STATUS_LABELS.scored },
  { value: 'insufficient_evidence', label: PROSPECT_STATUS_LABELS.insufficient_evidence },
  { value: 'disqualified', label: PROSPECT_STATUS_LABELS.disqualified },
];

export function ProspectsTable({
  campaignId,
  poll = false,
}: {
  campaignId: string;
  poll?: boolean;
}) {
  const { workspace } = useWorkspace();
  const [status, setStatus] = useState<ProspectsV2Filters['status']>('all');
  const { data, isLoading, isError, error, refetch } = useProspectsV2(
    workspace.id,
    { campaignId, status },
    { poll }
  );

  // Strongest leads first; unscored ones sink to the bottom.
  const prospects: ProspectV2[] = [...(data?.prospects ?? [])].sort(
    (a, b) => (b.score_total ?? -1) - (a.score_total ?? -1)
  );

  return (
    <div className="space-y-4">
      <Tabs
        value={status ?? 'all'}
        onValueChange={(v) => setStatus(v as ProspectsV2Filters['status'])}
      >
        <TabsList className="h-auto flex-wrap">
          {FILTER_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="text-xs">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : 'Failed to load prospects'}
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      ) : prospects.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-10 text-center">
          <Users className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            {status && status !== 'all'
              ? `No prospects with status "${PROSPECT_STATUS_LABELS[status]}" yet.`
              : 'No prospects discovered yet. Start the campaign to begin discovery.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[9rem]">Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Company</TableHead>
                <TableHead className="w-20 text-right">Score</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Email</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prospects.map((p) => (
                <TableRow key={p.id} className="group">
                  <TableCell className="whitespace-nowrap font-medium">
                    <Link
                      href={`/w/${workspace.id}/prospects/${p.id}`}
                      className="underline decoration-transparent underline-offset-2 group-hover:decoration-foreground"
                    >
                      {p.full_name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.role_title || '—'}
                  </TableCell>
                  <TableCell className="min-w-[10rem] text-sm">
                    {p.company ? (
                      <span>
                        {p.company.name}
                        {p.company.domain && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({p.company.domain})
                          </span>
                        )}
                      </span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {p.score_total == null
                      ? '—'
                      : Number.isInteger(p.score_total)
                        ? p.score_total
                        : p.score_total.toFixed(1)}
                  </TableCell>
                  <TableCell>
                    <StatusChip status={p.status} />
                  </TableCell>
                  <TableCell className="text-sm">
                    {p.email ? (
                      <span>
                        {p.email}
                        {p.email_confidence && (
                          <span className="ml-1.5 text-xs capitalize text-muted-foreground">
                            ({p.email_confidence})
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
