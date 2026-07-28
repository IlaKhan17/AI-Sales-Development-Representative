'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, Loader2, Mail, RefreshCw } from 'lucide-react';

import { useWorkspace } from '@/components/providers/workspace-provider';
import { RoleGate } from '@/components/role-gate';
import {
  useOverrideProspectStatus,
  useProspectDossier,
} from '@/lib/hooks/use-prospects-v2';
import type { ProspectV2Status } from '@/lib/api-types';
import {
  StatusChip,
  PROSPECT_STATUS_LABELS,
} from '@/components/evidence/status-chip';
import { ConfidenceBadge } from '@/components/evidence/confidence-badge';
import { ClaimCard } from '@/components/evidence/claim-card';
import { ScoreBreakdown } from '@/components/evidence/score-breakdown';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const OVERRIDE_STATUSES: ProspectV2Status[] = [
  'qualified',
  'needs_review',
  'insufficient_evidence',
  'disqualified',
];

export default function ProspectDossierPage() {
  const { prospectId } = useParams<{ prospectId: string }>();
  const { workspace } = useWorkspace();
  const { data, isLoading, isError, error, refetch } = useProspectDossier(
    workspace.id,
    prospectId
  );
  const override = useOverrideProspectStatus(workspace.id);
  const [pendingStatus, setPendingStatus] = useState<ProspectV2Status | null>(
    null
  );

  const confirmOverride = async () => {
    if (!pendingStatus) return;
    try {
      await override.mutateAsync({ prospectId, status: pendingStatus });
      toast.success(
        `Status set to "${PROSPECT_STATUS_LABELS[pendingStatus]}"`
      );
      setPendingStatus(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl space-y-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="max-w-3xl">
        <Card className="border-destructive/30">
          <CardContent className="py-10 text-center">
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : 'Failed to load prospect'}
            </p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" /> Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { prospect, evidence, signals, score } = data;
  const company = data.company ?? prospect.company;
  const evidenceById = new Map(evidence.map((e) => [e.id, e]));

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href={`/w/${workspace.id}/campaigns`}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Campaigns
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                {prospect.full_name}
              </h1>
              <StatusChip status={prospect.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {[prospect.role_title, company?.name].filter(Boolean).join(' at ') ||
                'Role and company unknown'}
              {company?.domain && (
                <a
                  href={`https://${company.domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 text-primary hover:underline"
                >
                  {company.domain}
                </a>
              )}
            </p>
            {prospect.email && (
              <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                {prospect.email}
                {prospect.email_confidence && (
                  <span className="text-xs capitalize">
                    ({prospect.email_confidence})
                  </span>
                )}
              </p>
            )}
          </div>
          <RoleGate action="create_campaign">
            <div className="w-52">
              <Select
                value=""
                onValueChange={(v) => setPendingStatus(v as ProspectV2Status)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Override status…" />
                </SelectTrigger>
                <SelectContent>
                  {OVERRIDE_STATUSES.filter((s) => s !== prospect.status).map(
                    (s) => (
                      <SelectItem key={s} value={s}>
                        {PROSPECT_STATUS_LABELS[s]}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
          </RoleGate>
        </div>
        {score?.disqualification_reason && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="font-medium">Disqualified:</span>{' '}
              {score.disqualification_reason}
            </span>
          </div>
        )}
      </div>

      <ScoreBreakdown score={score} />

      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Evidence</h2>
          <p className="text-sm text-muted-foreground">
            Sourced claims backing this prospect&apos;s score.
          </p>
        </div>
        {evidence.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No evidence collected yet.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {evidence.map((claim) => (
              <ClaimCard key={claim.id} claim={claim} />
            ))}
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Signals</CardTitle>
          <CardDescription>
            Detected buying and fit signals with linked evidence.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {signals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No signals detected.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {signals.map((signal, i) => {
                const linked = (signal.evidence_ids ?? []).filter((id) =>
                  evidenceById.has(id)
                ).length;
                const evidenceCount = signal.evidence_ids?.length ?? linked;
                return (
                  <span
                    key={`${signal.signal_type}-${i}`}
                    className="inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1.5 text-xs"
                  >
                    <span className="font-medium">
                      {signal.signal_type.replace(/[_-]/g, ' ')}
                    </span>
                    {signal.value && (
                      <span className="text-muted-foreground">{signal.value}</span>
                    )}
                    <ConfidenceBadge confidence={signal.confidence} />
                    <span className="text-muted-foreground">
                      {evidenceCount} evidence
                    </span>
                  </span>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={pendingStatus !== null}
        onOpenChange={(open) => !open && setPendingStatus(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Override prospect status</DialogTitle>
            <DialogDescription>
              Set {prospect.full_name}&apos;s status from{' '}
              <span className="font-medium">
                {PROSPECT_STATUS_LABELS[prospect.status] ?? prospect.status}
              </span>{' '}
              to{' '}
              <span className="font-medium">
                {pendingStatus ? PROSPECT_STATUS_LABELS[pendingStatus] : ''}
              </span>
              ? This manual override is recorded.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingStatus(null)}>
              Cancel
            </Button>
            <Button onClick={confirmOverride} disabled={override.isPending}>
              {override.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
