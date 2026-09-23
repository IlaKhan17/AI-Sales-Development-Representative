import { formatDistanceToNow } from 'date-fns';
import {
  CheckCircle2,
  CircleDashed,
  Loader2,
  XCircle,
} from 'lucide-react';

import type { AgentRun, RunStep } from '@/lib/api-types';
import { cn } from '@/lib/utils';

function StepIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed':
    case 'success':
      return <CheckCircle2 className="h-4 w-4 text-approve" />;
    case 'failed':
    case 'error':
      return <XCircle className="h-4 w-4 text-hold" />;
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin text-foreground" />;
    default:
      return <CircleDashed className="h-4 w-4 text-muted-foreground" />;
  }
}

function formatNode(node: string): string {
  return node.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function RunTimeline({
  run,
  steps,
}: {
  run: AgentRun;
  steps: RunStep[];
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span
          className={cn(
            'font-medium capitalize',
            run.status === 'failed' && 'text-hold',
            run.status === 'completed' && 'text-approve'
          )}
        >
          {run.status}
        </span>
        {run.started_at && (
          <span className="text-muted-foreground">
            Started {formatDistanceToNow(new Date(run.started_at), { addSuffix: true })}
          </span>
        )}
        {run.finished_at && (
          <span className="text-muted-foreground">
            Finished {formatDistanceToNow(new Date(run.finished_at), { addSuffix: true })}
          </span>
        )}
      </div>
      {run.error && (
        <p className="rounded-md border border-hold/30 bg-hold/10 p-3 text-sm text-hold">
          {run.error}
        </p>
      )}
      {steps.length === 0 ? (
        <p className="text-sm text-muted-foreground">No steps recorded yet.</p>
      ) : (
        <ol className="space-y-1">
          {steps.map((step, i) => (
            <li
              key={`${step.node}-${i}`}
              className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
            >
              <StepIcon status={step.status} />
              <span className="font-medium">{formatNode(step.node)}</span>
              <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
                {typeof step.latency_ms === 'number' && (
                  <span>{(step.latency_ms / 1000).toFixed(1)}s</span>
                )}
                <span className="capitalize">{step.status}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
