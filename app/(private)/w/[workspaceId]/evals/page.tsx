'use client';

import { use } from 'react';
import { AlertCircle } from 'lucide-react';

import { PageHeader, PageSection } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useBusinessOutcomes, useEvalRuns } from '@/lib/hooks/use-evals';
import type { BusinessOutcomes, EvalRun } from '@/lib/api-types';
import { cn } from '@/lib/utils';

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return 'n/a';
  return `${Math.round(value * 1000) / 10}%`;
}

type Row = { label: string; value: string; note?: string };

/**
 * Outcomes grouped by the question each answers, so a reader sees what a
 * number means next to the number itself.
 */
function OutcomeReport({ outcomes }: { outcomes: BusinessOutcomes }) {
  const groups: { question: string; rows: Row[] }[] = [
    {
      question: 'Are emails reaching people?',
      rows: [
        { label: 'Emails sent', value: String(outcomes.emails_sent) },
        {
          label: 'Delivered',
          value: formatPercent(outcomes.delivery_rate),
          note: `${outcomes.bounced_count} bounced`,
        },
      ],
    },
    {
      question: 'Are they responding?',
      rows: [
        {
          label: 'Reply rate',
          value: formatPercent(outcomes.reply_rate),
          note: `${outcomes.reply_count} ${outcomes.reply_count === 1 ? 'reply' : 'replies'}`,
        },
        {
          label: 'Positive replies',
          value: formatPercent(outcomes.positive_reply_rate),
          note: `${outcomes.positive_reply_count} interested or asked to meet`,
        },
        { label: 'Meetings booked', value: String(outcomes.meeting_booked_count) },
      ],
    },
    {
      question: 'Are we being careful?',
      rows: [
        {
          label: 'Unsubscribe rate',
          value: formatPercent(outcomes.unsubscribe_rate),
          note: 'Kept low even if it costs replies',
        },
        {
          label: 'Sent without edits',
          value: formatPercent(outcomes.pct_approved_unchanged),
          note: 'Share of approved drafts nobody had to change',
        },
        { label: 'Waiting for approval', value: String(outcomes.approvals_pending) },
      ],
    },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {groups.map((group) => (
        <section key={group.question} className="rounded-md border border-border bg-card">
          <h3 className="border-b border-border px-5 py-3 text-sm font-semibold">
            {group.question}
          </h3>
          <dl className="divide-y divide-border">
            {group.rows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-4 px-5 py-3">
                <dt className="text-sm">
                  {row.label}
                  {row.note && (
                    <span className="block text-xs text-muted-foreground">{row.note}</span>
                  )}
                </dt>
                <dd className="text-2xl font-bold tracking-tight">{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

function RunMetrics({ summary }: { summary: EvalRun['summary'] }) {
  if (!summary || typeof summary !== 'object') return null;
  const entries = Object.entries(summary).filter(
    ([, v]) => typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean'
  );
  if (entries.length === 0) return null;
  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {entries.slice(0, 6).map(([key, value]) => (
        <div key={key} className="flex gap-1">
          <dt className="text-muted-foreground">{key.replaceAll('_', ' ')}</dt>
          <dd className="font-semibold">
            {typeof value === 'number' ? Math.round(value * 1000) / 1000 : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const RUN_TONES: Record<string, string> = {
  completed: 'border-border bg-card text-foreground',
  failed: 'border-hold/30 bg-hold/10 text-hold',
  running: 'border-dashed border-border text-muted-foreground',
};

export default function EvalsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = use(params);
  const outcomesQuery = useBusinessOutcomes(workspaceId);
  const runsQuery = useEvalRuns(workspaceId);

  return (
    <div className="space-y-10">
      <PageHeader
        title="Evals"
        description="How outreach is doing with real buyers, and how the agent scores on its test suites. The two are tracked apart: a pushy email can win replies and still hurt you."
      />

      <PageSection title="Results with real buyers">
        {outcomesQuery.isLoading ? (
          <div className="grid gap-6 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full" />
            ))}
          </div>
        ) : outcomesQuery.isError ? (
          <p className="flex items-center gap-2 text-sm text-hold">
            <AlertCircle className="h-4 w-4" />
            Couldn&apos;t load outcomes.
            <button
              onClick={() => outcomesQuery.refetch()}
              className="font-medium text-foreground underline underline-offset-4"
            >
              Retry
            </button>
          </p>
        ) : outcomesQuery.data ? (
          <OutcomeReport outcomes={outcomesQuery.data.outcomes} />
        ) : null}
      </PageSection>

      <PageSection
        title="Test suite runs"
        description="Scoring, reply classification, email quality and send-policy suites, run in CI or locally."
      >
        {runsQuery.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : runsQuery.data && runsQuery.data.runs.length > 0 ? (
          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Suite</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Metrics</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runsQuery.data.runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-medium">{run.suite}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize',
                          RUN_TONES[run.status] ?? RUN_TONES.running
                        )}
                      >
                        {run.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(run.started_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <RunMetrics summary={run.summary} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border px-6 py-10 text-center">
            <p className="text-sm font-medium">No suite runs recorded yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Run the suites from the backend folder:</p>
            <code className="mt-3 inline-block rounded bg-muted px-2 py-1 text-xs">
              cd agents &amp;&amp; python -m evals.runner --suite all
            </code>
          </div>
        )}
      </PageSection>
    </div>
  );
}
