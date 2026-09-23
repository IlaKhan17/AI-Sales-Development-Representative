'use client';

import Link from 'next/link';

import { CampaignStatusBadge } from '@/components/campaigns/campaign-status-badge';
import { campaignTotal } from '@/components/campaigns/campaign-funnel';
import { DashboardData } from './DashboardTabs';

function pct(value: number | null | undefined) {
  if (value === null || value === undefined) return 'n/a';
  return `${Math.round(value * 1000) / 10}%`;
}

/**
 * Workspace overview, built only from live data: what is waiting on a
 * person, how each campaign is doing, and what outreach has produced.
 */
export function DashboardOverview({ dashboardOverview }: { dashboardOverview: DashboardData }) {
  const { workspaceId, campaigns, outcomes, stats } = dashboardOverview;
  const ws = (path: string) => `/w/${workspaceId}${path}`;
  const pending = outcomes?.approvals_pending ?? 0;
  const qualified = campaigns.reduce((n, c) => n + (c.counts?.qualified ?? 0), 0);
  const running = campaigns.filter((c) => c.status === 'running').length;

  const todo: { text: string; href: string; action: string }[] = [];
  if (pending > 0)
    todo.push({
      text: `${pending} ${pending === 1 ? 'draft is' : 'drafts are'} waiting for your approval.`,
      href: ws('/approvals'),
      action: 'Review drafts',
    });
  if (campaigns.length === 0)
    todo.push({
      text: 'No campaigns yet. Define your ideal customer, then start a campaign to find prospects.',
      href: ws('/campaigns/new'),
      action: 'New campaign',
    });
  else if (qualified > 0 && (outcomes?.emails_sent ?? 0) === 0 && pending === 0)
    todo.push({
      text: `${qualified} qualified ${qualified === 1 ? 'prospect has' : 'prospects have'} not been emailed. Enroll them in a sequence to draft the first email.`,
      href: ws('/campaigns'),
      action: 'Open campaigns',
    });

  return (
    <div className="space-y-10">
      <section aria-labelledby="todo-heading" className="space-y-3">
        <h2 id="todo-heading" className="text-lg font-semibold">
          Waiting on you
        </h2>
        {todo.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-5 py-4 text-sm text-muted-foreground">
            Nothing needs a decision right now.
            {running > 0 && ` ${running} ${running === 1 ? 'campaign is' : 'campaigns are'} still searching.`}
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border bg-card">
            {todo.map((item) => (
              <li
                key={item.text}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              >
                <p className="text-sm">{item.text}</p>
                <Link
                  href={item.href}
                  className="text-sm font-semibold underline decoration-border underline-offset-4 hover:decoration-foreground"
                >
                  {item.action}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="campaigns-heading" className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <h2 id="campaigns-heading" className="text-lg font-semibold">
            Campaigns
          </h2>
          {campaigns.length > 0 && (
            <Link href={ws('/campaigns')} className="text-sm text-muted-foreground hover:text-foreground">
              All campaigns
            </Link>
          )}
        </div>
        {campaigns.length === 0 ? (
          <p className="text-sm text-muted-foreground">Campaigns you start will be listed here.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border bg-card">
            {campaigns.slice(0, 5).map((c) => (
              <li key={c.id}>
                <Link
                  href={ws(`/campaigns/${c.id}`)}
                  className="grid gap-2 px-5 py-3 transition-colors hover:bg-background/60 sm:grid-cols-[minmax(0,1fr)_auto_7rem] sm:items-center sm:gap-6"
                >
                  <span className="truncate font-medium">{c.name}</span>
                  <span className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{c.counts?.qualified ?? 0}</span>{' '}
                    qualified of {campaignTotal(c.counts)}
                  </span>
                  <span className="sm:text-right">
                    <CampaignStatusBadge status={c.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="results-heading" className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <h2 id="results-heading" className="text-lg font-semibold">
            Results so far
          </h2>
          <Link href={ws('/evals')} className="text-sm text-muted-foreground hover:text-foreground">
            Full report
          </Link>
        </div>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-4">
          {[
            { label: 'Prospects found', value: String(stats.totalProspects) },
            { label: 'Emails sent', value: String(outcomes?.emails_sent ?? stats.emailsSent) },
            { label: 'Reply rate', value: pct(outcomes?.reply_rate) },
            { label: 'Meetings booked', value: String(outcomes?.meeting_booked_count ?? 0) },
          ].map((f) => (
            <div key={f.label} className="bg-card px-5 py-4">
              <dt className="text-sm text-muted-foreground">{f.label}</dt>
              <dd className="mt-1 text-3xl font-bold tracking-tight">{f.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
