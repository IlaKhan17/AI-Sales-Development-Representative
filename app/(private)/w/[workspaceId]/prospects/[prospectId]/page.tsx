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
import type { ProspectSignal, ProspectV2Status } from '@/lib/api-types';
import {
  StatusChip,
  PROSPECT_STATUS_LABELS,
} from '@/components/evidence/status-chip';
import { ConfidenceBadge } from '@/components/evidence/confidence-badge';
import { ClaimCard } from '@/components/evidence/claim-card';
import { Citations, ScoreBreakdown } from '@/components/evidence/score-breakdown';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
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

// Which ledger line each extracted signal supports.
const SIGNAL_TO_COMPONENT: Record<string, string> = {
  role_match: 'role',
  industry: 'industry',
  company_size: 'company_size',
  geography: 'geography',
  technology: 'technology',
  buying_signal: 'buying_signals',
  pain_signal: 'buying_signals',
};

const SIGNAL_LABELS: Record<string, string> = {
  role_match: 'Role',
  industry: 'Industry',
  company_size: 'Company size',
  geography: 'Location',
  technology: 'Uses',
  buying_signal: 'Buying signal',
  pain_signal: 'Pain point',
};

const OVERRIDE_STATUSES: ProspectV2Status[] = [
  'qualified',
  'needs_review',
  'insufficient_evidence',
  'disqualified',
];

function signalText(value: ProspectSignal['value']): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  const inner = value.value ?? value.type;
  if (inner == null) return '';
  return Array.isArray(inner) ? inner.join(', ') : String(inner);
}

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
        `Status changed to ${PROSPECT_STATUS_LABELS[pendingStatus]}`
      );
      setPendingStatus(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
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
  // Sources are numbered in the order the API returns them; citations in the
  // ledger and signal list point at these numbers.
  const sourceNumber = new Map(evidence.map((e, i) => [e.id, i + 1]));
  const citeFor = (ids: string[] | undefined) =>
    Array.from(
      new Set((ids ?? []).map((id) => sourceNumber.get(id)).filter((n): n is number => !!n))
    ).sort((a, b) => a - b);

  const componentCitations: Record<string, number[]> = {};
  for (const signal of signals) {
    const component = SIGNAL_TO_COMPONENT[signal.signal_type];
    if (!component) continue;
    componentCitations[component] = Array.from(
      new Set([...(componentCitations[component] ?? []), ...citeFor(signal.evidence_ids)])
    ).sort((a, b) => a - b);
  }

  const backHref = prospect.campaign_id
    ? `/w/${workspace.id}/campaigns/${prospect.campaign_id}`
    : `/w/${workspace.id}/prospects`;

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {prospect.campaign_id ? 'Back to campaign' : 'All prospects'}
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{prospect.full_name}</h1>
              <StatusChip status={prospect.status} />
            </div>
            <p className="text-base text-muted-foreground">
              {[prospect.role_title, company?.name].filter(Boolean).join(' at ') ||
                'Role and company unknown'}
              {company?.domain && (
                <a
                  href={`https://${company.domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 text-foreground underline decoration-border underline-offset-2"
                >
                  {company.domain}
                </a>
              )}
            </p>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              {prospect.email ? (
                <>
                  <span className="text-foreground">{prospect.email}</span>
                  {prospect.email_confidence && (
                    <span className="capitalize">({prospect.email_confidence} address)</span>
                  )}
                </>
              ) : (
                'No email found yet, so this prospect cannot be enrolled.'
              )}
            </p>
          </div>
          <RoleGate action="create_campaign">
            <div className="w-full sm:w-56">
              <Select value="" onValueChange={(v) => setPendingStatus(v as ProspectV2Status)}>
                <SelectTrigger aria-label="Change status">
                  <SelectValue placeholder="Change status" />
                </SelectTrigger>
                <SelectContent>
                  {OVERRIDE_STATUSES.filter((s) => s !== prospect.status).map((s) => (
                    <SelectItem key={s} value={s}>
                      {PROSPECT_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </RoleGate>
        </div>
        {score?.disqualification_reason && (
          <div className="flex items-start gap-2 rounded-md border border-hold/30 bg-hold/10 p-3 text-sm text-hold">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="font-semibold">Disqualified.</span> {score.disqualification_reason}
            </span>
          </div>
        )}
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="space-y-8">
          <ScoreBreakdown score={score} citations={componentCitations} />

          <section aria-labelledby="signals-heading">
            <h2 id="signals-heading" className="text-base font-semibold">
              What Davis extracted
            </h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Facts pulled from the sources. Anything without a source is dropped before scoring.
            </p>
            {signals.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                No facts could be extracted from the sources found so far.
              </p>
            ) : (
              <dl className="divide-y divide-border rounded-md border border-border bg-card">
                {signals.map((signal, i) => (
                  <div
                    key={`${signal.signal_type}-${i}`}
                    className="grid grid-cols-[8.5rem_1fr_auto] items-baseline gap-4 px-4 py-2.5 text-sm"
                  >
                    <dt className="text-muted-foreground">
                      {SIGNAL_LABELS[signal.signal_type] ?? signal.signal_type.replace(/[_-]/g, ' ')}
                    </dt>
                    <dd className="min-w-0">
                      {signalText(signal.value) || 'n/a'}
                      <Citations numbers={citeFor(signal.evidence_ids)} />
                    </dd>
                    <dd>
                      <ConfidenceBadge confidence={signal.confidence} />
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        </div>

        <aside aria-labelledby="sources-heading" className="lg:sticky lg:top-8 lg:self-start">
          <h2 id="sources-heading" className="text-base font-semibold">
            Sources
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Where each fact came from, quoted as found.
          </p>
          {evidence.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
              No sources yet. Without sources a prospect stays at insufficient evidence.
            </p>
          ) : (
            <div className="space-y-3 lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto lg:pr-1">
              {evidence.map((claim, i) => (
                <ClaimCard key={claim.id} claim={claim} number={i + 1} />
              ))}
            </div>
          )}
        </aside>
      </div>

      <Dialog
        open={pendingStatus !== null}
        onOpenChange={(open) => !open && setPendingStatus(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change status</DialogTitle>
            <DialogDescription>
              Set {prospect.full_name}&apos;s status from{' '}
              <span className="font-medium">
                {PROSPECT_STATUS_LABELS[prospect.status] ?? prospect.status}
              </span>{' '}
              to{' '}
              <span className="font-medium">
                {pendingStatus ? PROSPECT_STATUS_LABELS[pendingStatus] : ''}
              </span>
              . The change is recorded as a manual override.
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
              Change status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
