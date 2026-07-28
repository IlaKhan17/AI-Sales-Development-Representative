'use client';

import Link from 'next/link';
import { Megaphone, Plus, RefreshCw } from 'lucide-react';

import { useWorkspace } from '@/components/providers/workspace-provider';
import { RoleGate } from '@/components/role-gate';
import { useCampaigns } from '@/lib/hooks/use-campaigns';
import { CampaignStatusBadge } from '@/components/campaigns/campaign-status-badge';
import {
  CampaignFunnel,
  campaignTotal,
} from '@/components/campaigns/campaign-funnel';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function CampaignsPage() {
  const { workspace } = useWorkspace();
  const { data, isLoading, isError, error, refetch } = useCampaigns(workspace.id);
  const campaigns = data?.campaigns ?? [];

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            Evidence-grounded prospecting runs against a versioned ICP.
          </p>
        </div>
        <RoleGate action="create_campaign">
          <Button asChild>
            <Link href={`/w/${workspace.id}/campaigns/new`}>
              <Plus className="mr-2 h-4 w-4" /> New Campaign
            </Link>
          </Button>
        </RoleGate>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <Card className="border-destructive/30">
          <CardContent className="py-10 text-center">
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : 'Failed to load campaigns'}
            </p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" /> Retry
            </Button>
          </CardContent>
        </Card>
      ) : campaigns.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center">
            <Megaphone className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <h2 className="mt-4 text-lg font-medium">No campaigns yet</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Create your first campaign to discover, research, and score
              prospects against an active ICP version.
            </p>
            <RoleGate action="create_campaign">
              <Button asChild className="mt-5">
                <Link href={`/w/${workspace.id}/campaigns/new`}>
                  <Plus className="mr-2 h-4 w-4" /> Create Campaign
                </Link>
              </Button>
            </RoleGate>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {campaigns.map((c) => {
            const total = campaignTotal(c.counts);
            return (
              <Link
                key={c.id}
                href={`/w/${workspace.id}/campaigns/${c.id}`}
                className="block"
              >
                <Card className="transition-colors hover:border-primary/40">
                  <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
                    <div className="space-y-1">
                      <CardTitle className="text-base">{c.name}</CardTitle>
                      <CardDescription>
                        {c.objective || 'No objective set'}
                        {c.region ? ` · ${c.region}` : ''}
                      </CardDescription>
                    </div>
                    <CampaignStatusBadge status={c.status} />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {c.counts && <CampaignFunnel counts={c.counts} showLegend={false} />}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        <span className="font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {c.counts?.qualified ?? 0}
                        </span>{' '}
                        qualified of{' '}
                        <span className="font-medium text-foreground tabular-nums">{total}</span>{' '}
                        prospects
                      </span>
                      <span>Target: {c.target_prospect_count}</span>
                      <span>{c.allowed_sources.length} sources</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
