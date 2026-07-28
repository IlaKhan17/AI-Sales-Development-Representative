'use client';

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { Loader2, Plus, RefreshCw, Trash2, UserPlus } from 'lucide-react';

import { useWorkspace } from '@/components/providers/workspace-provider';
import { RoleGate } from '@/components/role-gate';
import {
  useCreateSequence,
  useEnrollProspects,
  useEnrollments,
  useSequences,
} from '@/lib/hooks/use-sequences';
import { useProspectsV2 } from '@/lib/hooks/use-prospects-v2';
import type { EnrollmentStatus, Sequence, SequenceStep } from '@/lib/api-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const MAX_STEPS = 4;
const ENROLL_CAP = 20;

const ENROLLMENT_STATUS_LABEL: Record<EnrollmentStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  stopped_reply: 'Stopped (reply)',
  stopped_unsubscribe: 'Stopped (unsubscribe)',
  stopped_bounce: 'Stopped (bounce)',
};

const ENROLLMENT_STATUS_CLASS: Record<EnrollmentStatus, string> = {
  active:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  paused: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  completed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  stopped_reply: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  stopped_unsubscribe:
    'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  stopped_bounce:
    'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

export function SequencesSection({ campaignId }: { campaignId: string }) {
  const { workspace } = useWorkspace();
  const { data, isLoading, isError, error, refetch } = useSequences(
    workspace.id,
    campaignId
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Sequences</CardTitle>
            <CardDescription>
              Multi-step outreach sequences for this campaign.
            </CardDescription>
          </div>
          <RoleGate action="create_campaign">
            <CreateSequenceDialog campaignId={campaignId} />
          </RoleGate>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : isError ? (
          <div className="flex items-center gap-3">
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : 'Failed to load sequences'}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" /> Retry
            </Button>
          </div>
        ) : !data || data.sequences.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No sequences yet. Create one to start multi-step outreach.
          </p>
        ) : (
          data.sequences.map((sequence) => (
            <SequenceCard
              key={sequence.id}
              sequence={sequence}
              campaignId={campaignId}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function CreateSequenceDialog({ campaignId }: { campaignId: string }) {
  const { workspace } = useWorkspace();
  const create = useCreateSequence(workspace.id);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [steps, setSteps] = useState<SequenceStep[]>([
    { step_number: 1, objective: '', delay_days: 0 },
  ]);

  const updateStep = (index: number, patch: Partial<SequenceStep>) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s))
    );
  };

  const addStep = () =>
    setSteps((prev) => [
      ...prev,
      { step_number: prev.length + 1, objective: '', delay_days: 3 },
    ]);

  const removeStep = (index: number) =>
    setSteps((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((s, i) => ({ ...s, step_number: i + 1 }))
    );

  const valid =
    name.trim().length > 0 &&
    steps.length > 0 &&
    steps.every((s) => s.objective.trim().length > 0 && s.delay_days >= 0);

  const handleCreate = async () => {
    try {
      await create.mutateAsync({
        campaign_id: campaignId,
        name: name.trim(),
        steps: steps.map((s, i) => ({ ...s, step_number: i + 1 })),
      });
      toast.success('Sequence created');
      setOpen(false);
      setName('');
      setSteps([{ step_number: 1, objective: '', delay_days: 0 }]);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to create sequence'
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 h-4 w-4" /> Create Sequence
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create sequence</DialogTitle>
          <DialogDescription>
            Define up to {MAX_STEPS} steps. Each step drafts an email with the
            given objective after the delay.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sequence-name">Name</Label>
            <Input
              id="sequence-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Intro + 2 follow-ups"
            />
          </div>
          <div className="space-y-2">
            <Label>Steps</Label>
            {steps.map((step, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="mt-2.5 w-5 shrink-0 text-xs text-muted-foreground">
                  {i + 1}.
                </span>
                <Input
                  value={step.objective}
                  onChange={(e) => updateStep(i, { objective: e.target.value })}
                  placeholder="Objective, e.g. introduce and ask for a call"
                />
                <div className="flex shrink-0 items-center gap-1">
                  <Input
                    type="number"
                    min={0}
                    max={60}
                    className="w-16"
                    value={step.delay_days}
                    onChange={(e) =>
                      updateStep(i, {
                        delay_days: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    aria-label={`Step ${i + 1} delay in days`}
                  />
                  <span className="text-xs text-muted-foreground">days</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={steps.length <= 1}
                  onClick={() => removeStep(i)}
                  aria-label={`Remove step ${i + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              disabled={steps.length >= MAX_STEPS}
              onClick={addStep}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add step
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={handleCreate}
            disabled={!valid || create.isPending}
          >
            {create.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SequenceCard({
  sequence,
  campaignId,
}: {
  sequence: Sequence;
  campaignId: string;
}) {
  const { workspace } = useWorkspace();
  const enrollments = useEnrollments(workspace.id, sequence.id);

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{sequence.name}</p>
          <p className="text-xs text-muted-foreground">
            {sequence.steps.length} step{sequence.steps.length === 1 ? '' : 's'}:{' '}
            {sequence.steps
              .map((s) => `${s.objective} (+${s.delay_days}d)`)
              .join(' → ')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{sequence.status}</Badge>
          <RoleGate action="create_campaign">
            <EnrollDialog sequenceId={sequence.id} campaignId={campaignId} />
          </RoleGate>
        </div>
      </div>

      <div className="mt-3">
        {enrollments.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : enrollments.isError ? (
          <p className="text-xs text-destructive">Failed to load enrollments.</p>
        ) : !enrollments.data || enrollments.data.enrollments.length === 0 ? (
          <p className="text-xs text-muted-foreground">No prospects enrolled yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prospect</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Step</TableHead>
                <TableHead>Next send</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enrollments.data.enrollments.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-sm">
                    {e.prospect?.full_name ?? 'Unknown'}
                    {e.prospect?.company_name && (
                      <span className="text-muted-foreground">
                        {' '}
                        · {e.prospect.company_name}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={ENROLLMENT_STATUS_CLASS[e.status]}
                    >
                      {ENROLLMENT_STATUS_LABEL[e.status] ?? e.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{e.current_step}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {e.next_send_at
                      ? formatDistanceToNow(new Date(e.next_send_at), {
                          addSuffix: true,
                        })
                      : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function EnrollDialog({
  sequenceId,
  campaignId,
}: {
  sequenceId: string;
  campaignId: string;
}) {
  const { workspace } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const enroll = useEnrollProspects(workspace.id);
  const prospects = useProspectsV2(workspace.id, {
    campaignId,
    status: 'qualified',
  });

  const toggle = (id: string, checked: boolean) => {
    setSelected((prev) => {
      if (!checked) return prev.filter((p) => p !== id);
      if (prev.length >= ENROLL_CAP) return prev;
      return [...prev, id];
    });
  };

  const handleEnroll = async () => {
    try {
      const result = await enroll.mutateAsync({
        sequenceId,
        prospectIds: selected,
      });
      setOpen(false);
      setSelected([]);
      toast.success(
        `Enrolled ${result.enrolled} prospect${result.enrolled === 1 ? '' : 's'}; ${result.drafts_created} draft${result.drafts_created === 1 ? '' : 's'} created`,
        {
          action: {
            label: 'Review approvals',
            onClick: () => {
              window.location.href = `/w/${workspace.id}/approvals`;
            },
          },
        }
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to enroll');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSelected([]);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Enroll
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enroll qualified prospects</DialogTitle>
          <DialogDescription>
            Select up to {ENROLL_CAP} qualified prospects to enroll in this
            sequence.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
          {prospects.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : prospects.isError ? (
            <p className="text-sm text-destructive">
              Failed to load qualified prospects.
            </p>
          ) : !prospects.data || prospects.data.prospects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No qualified prospects in this campaign yet.
            </p>
          ) : (
            prospects.data.prospects.map((p) => {
              const checked = selected.includes(p.id);
              return (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50"
                >
                  <Checkbox
                    checked={checked}
                    disabled={!checked && selected.length >= ENROLL_CAP}
                    onCheckedChange={(v) => toggle(p.id, v === true)}
                  />
                  <span className="text-sm">
                    {p.full_name}
                    {p.company?.name && (
                      <span className="text-muted-foreground">
                        {' '}
                        · {p.company.name}
                      </span>
                    )}
                  </span>
                </label>
              );
            })
          )}
        </div>
        <DialogFooter className="items-center gap-2 sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {selected.length}/{ENROLL_CAP} selected
          </span>
          <Button
            onClick={handleEnroll}
            disabled={selected.length === 0 || enroll.isPending}
          >
            {enroll.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Enroll {selected.length > 0 ? selected.length : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

