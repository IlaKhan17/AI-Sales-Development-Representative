'use client';

import { use } from 'react';
import { Activity, AlertCircle, BarChart3, FlaskConical } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return `${Math.round(value * 1000) / 10}%`;
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="glass-card">
      <CardContent className="pt-6">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function OutcomeTiles({ outcomes }: { outcomes: BusinessOutcomes }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatTile label="Emails sent" value={String(outcomes.emails_sent)} />
      <StatTile
        label="Reply rate"
        value={formatPercent(outcomes.reply_rate)}
        hint={`${outcomes.reply_count} repl${outcomes.reply_count === 1 ? 'y' : 'ies'}`}
      />
      <StatTile
        label="Positive reply rate"
        value={formatPercent(outcomes.positive_reply_rate)}
        hint={`${outcomes.positive_reply_count} interested or meeting requested`}
      />
      <StatTile label="Meetings booked" value={String(outcomes.meeting_booked_count)} />
      <StatTile
        label="Unsubscribe rate"
        value={formatPercent(outcomes.unsubscribe_rate)}
        hint="Protected safety metric"
      />
      <StatTile
        label="Pending approvals"
        value={String(outcomes.approvals_pending)}
        hint={
          outcomes.pct_approved_unchanged !== null
            ? `${formatPercent(outcomes.pct_approved_unchanged)} approved unchanged`
            : undefined
        }
      />
    </div>
  );
}

function summaryBadges(summary: EvalRun['summary']) {
  if (!summary || typeof summary !== 'object') return null;
  const entries = Object.entries(summary).filter(
    ([, v]) => typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean'
  );
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.slice(0, 6).map(([key, value]) => (
        <Badge key={key} variant="secondary" className="font-mono text-[10px]">
          {key}: {typeof value === 'number' ? Math.round(value * 1000) / 1000 : String(value)}
        </Badge>
      ))}
    </div>
  );
}

export default function EvalsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = use(params);
  const outcomesQuery = useBusinessOutcomes(workspaceId);
  const runsQuery = useEvalRuns(workspaceId);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <BarChart3 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Evaluation</h1>
          <p className="text-muted-foreground">
            Business outcomes from production, and eval-suite results from CI.
          </p>
        </div>
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Business outcomes</h2>
        </div>
        {outcomesQuery.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        ) : outcomesQuery.isError ? (
          <Card className="glass-card border-destructive/30">
            <CardContent className="flex items-center gap-2 pt-6 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4 text-destructive" />
              Could not load outcomes.
              <button
                onClick={() => outcomesQuery.refetch()}
                className="font-medium text-primary underline underline-offset-4"
              >
                Retry
              </button>
            </CardContent>
          </Card>
        ) : outcomesQuery.data ? (
          <OutcomeTiles outcomes={outcomesQuery.data.outcomes} />
        ) : null}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Eval runs</h2>
        </div>
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base">Recent suite results</CardTitle>
            <CardDescription>
              Agent-quality suites run in CI and locally; production metrics above are tracked
              separately.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {runsQuery.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : runsQuery.data && runsQuery.data.runs.length > 0 ? (
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
                        <Badge
                          variant={run.status === 'completed' ? 'secondary' : 'outline'}
                          className={
                            run.status === 'failed' ? 'border-destructive/40 text-destructive' : ''
                          }
                        >
                          {run.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(run.started_at).toLocaleString()}
                      </TableCell>
                      <TableCell>{summaryBadges(run.summary)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <FlaskConical className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No eval runs yet.</p>
                <code className="rounded bg-muted px-2 py-1 text-xs">
                  cd agents &amp;&amp; python -m evals.runner --suite all
                </code>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
