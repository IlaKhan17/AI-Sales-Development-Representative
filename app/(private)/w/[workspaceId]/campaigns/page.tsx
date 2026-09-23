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
import { PageHeader } from '@/components/page-header';

export default function CampaignsPage() {
  const { workspace } = useWorkspace();
  const { data, isLoading, isError, error, refetch } = useCampaigns(workspace.id);
  const campaigns = data?.campaigns ?? [];

  const newButton = (
    <RoleGate action="create_campaign">
      <Button asChild>
        <Link href={`/w/${workspace.id}/campaigns/new`}>
          <Plus className="mr-2 h-4 w-4" /> New campaign
        </Link>
      </Button>
    </RoleGate>
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Campaigns"
        description="Each campaign searches for prospects that fit one version of your ideal customer, then scores them."
        actions={campaigns.length > 0 ? newButton : undefined}
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-md border border-hold/30 bg-hold/10 p-6 text-center">
          <p className="text-sm text-hold">
            {error instanceof Error ? error.message : "Couldn't load campaigns."}
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-6 py-14 text-center">
          <Megaphone className="mx-auto h-6 w-6 text-muted-foreground" />
          <h2 className="mt-3 text-base font-semibold">No campaigns yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            A campaign finds and scores prospects against your ideal customer. You need an active
            version of it first.
          </p>
          <div className="mt-5 flex justify-center">{newButton}</div>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border bg-card">
          {campaigns.map((c) => {
            const total = campaignTotal(c.counts);
            return (
              <li key={c.id}>
                <Link
                  href={`/w/${workspace.id}/campaigns/${c.id}`}
                  className="grid gap-3 px-5 py-4 transition-colors hover:bg-background/60 md:grid-cols-[minmax(0,1fr)_14rem_7rem] md:items-center md:gap-8"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{c.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {c.objective || 'No objective set'}
                    </p>
                    {c.region && (
                      <p className="text-xs text-muted-foreground">Region: {c.region}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-sm">
                      <span className="font-semibold">{c.counts?.qualified ?? 0}</span>
                      <span className="text-muted-foreground">
                        {' '}
                        qualified of {total} found, target {c.target_prospect_count}
                      </span>
                    </p>
                    {c.counts && <CampaignFunnel counts={c.counts} showLegend={false} />}
                  </div>
                  <div className="md:text-right">
                    <CampaignStatusBadge status={c.status} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
