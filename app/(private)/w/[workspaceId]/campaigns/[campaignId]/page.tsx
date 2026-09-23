'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Pause, Play, RefreshCw } from 'lucide-react';

import { useWorkspace } from '@/components/providers/workspace-provider';
import { RoleGate } from '@/components/role-gate';
import {
  useCampaign,
  usePauseCampaign,
  useStartCampaign,
} from '@/lib/hooks/use-campaigns';
import { useRun } from '@/lib/hooks/use-run';
import { CampaignStatusBadge } from '@/components/campaigns/campaign-status-badge';
import {
  CampaignFunnel,
  campaignTotal,
} from '@/components/campaigns/campaign-funnel';
import { RunTimeline } from '@/components/campaigns/run-timeline';
import { ProspectsTable } from '@/components/campaigns/prospects-table';
import { SequencesSection } from '@/components/campaigns/sequences-section';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

export default function CampaignDetailPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const { workspace } = useWorkspace();
  const { data, isLoading, isError, error, refetch } = useCampaign(
    workspace.id,
    campaignId
  );
  const startCampaign = useStartCampaign(workspace.id);
  const pauseCampaign = usePauseCampaign(workspace.id);
  // Run id returned by a fresh Start; falls back to latest_run from detail.
  const [startedRunId, setStartedRunId] = useState<string | null>(null);

  const runId = startedRunId ?? data?.latest_run?.id ?? null;
  const runQuery = useRun(workspace.id, runId);

  const handleStart = async () => {
    try {
      const { run_id } = await startCampaign.mutateAsync(campaignId);
      setStartedRunId(run_id);
      toast.success('Campaign started');
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start campaign');
    }
  };

  const handlePause = async () => {
    try {
      await pauseCampaign.mutateAsync(campaignId);
      toast.success('Campaign paused');
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to pause campaign');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="max-w-4xl">
        <Card className="border-destructive/30">
          <CardContent className="py-10 text-center">
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : 'Failed to load campaign'}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" /> Retry
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/w/${workspace.id}/campaigns`}>Back to campaigns</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { campaign, counts } = data;
  const canStart = campaign.status === 'draft' || campaign.status === 'paused';
  const canPause = campaign.status === 'running';
  const total = campaignTotal(counts);

  return (
    <div className="space-y-10">
      <header className="space-y-4">
        <Link
          href={`/w/${workspace.id}/campaigns`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All campaigns
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{campaign.name}</h1>
              <CampaignStatusBadge status={campaign.status} />
            </div>
            {campaign.objective && (
              <p className="max-w-2xl text-base text-muted-foreground">{campaign.objective}</p>
            )}
          </div>
          <RoleGate action="create_campaign">
            <div className="flex gap-2">
              {canStart && (
                <Button onClick={handleStart} disabled={startCampaign.isPending}>
                  {startCampaign.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="mr-2 h-4 w-4" />
                  )}
                  {campaign.status === 'paused' ? 'Resume campaign' : 'Start campaign'}
                </Button>
              )}
              {canPause && (
                <Button variant="outline" onClick={handlePause} disabled={pauseCampaign.isPending}>
                  {pauseCampaign.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Pause className="mr-2 h-4 w-4" />
                  )}
                  Pause campaign
                </Button>
              )}
            </div>
          </RoleGate>
        </div>
      </header>

      <section aria-labelledby="standing-heading" className="space-y-4">
        <div>
          <h2 id="standing-heading" className="text-lg font-semibold">
            Where prospects stand
          </h2>
          <p className="text-sm text-muted-foreground">
            {counts.qualified} qualified of {total} found, against a target of{' '}
            {campaign.target_prospect_count}.
          </p>
        </div>
        {total === 0 ? (
          <p className="rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
            No prospects yet. Start the campaign and Davis begins searching.
          </p>
        ) : (
          <CampaignFunnel counts={counts} />
        )}
      </section>

      <section aria-labelledby="prospects-heading" className="space-y-4">
        <div>
          <h2 id="prospects-heading" className="text-lg font-semibold">
            Prospects
          </h2>
          <p className="text-sm text-muted-foreground">
            Highest score first. Open a name to see the evidence behind it.
          </p>
        </div>
        <ProspectsTable campaignId={campaignId} poll={campaign.status === 'running'} />
      </section>

      <section aria-labelledby="run-heading" className="space-y-4">
        <div>
          <h2 id="run-heading" className="text-lg font-semibold">
            Latest run
          </h2>
          <p className="text-sm text-muted-foreground">
            Each step the agent took on its most recent pass.
          </p>
        </div>
        <div className="rounded-md border border-border bg-card p-5">
          {!runId ? (
            <p className="text-sm text-muted-foreground">
              No runs yet. Start the campaign to launch the agent pipeline.
            </p>
          ) : runQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : runQuery.isError ? (
            <div className="flex items-center gap-3">
              <p className="text-sm text-destructive">Couldn&apos;t load this run.</p>
              <Button variant="outline" size="sm" onClick={() => runQuery.refetch()}>
                Retry
              </Button>
            </div>
          ) : runQuery.data ? (
            <RunTimeline run={runQuery.data.run} steps={runQuery.data.steps} />
          ) : null}
        </div>
      </section>

      <SequencesSection campaignId={campaignId} />
    </div>
  );
}
