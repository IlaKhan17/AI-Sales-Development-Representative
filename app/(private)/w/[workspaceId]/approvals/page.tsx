'use client';

import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Check,
  Inbox,
  Loader2,
  Pencil,
  RefreshCw,
  X,
} from 'lucide-react';

import { useWorkspace } from '@/components/providers/workspace-provider';
import { RoleGate } from '@/components/role-gate';
import {
  useDecideApproval,
  usePendingApprovals,
} from '@/lib/hooks/use-approvals';
import type { Approval } from '@/lib/api-types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

export default function ApprovalsPage() {
  const { workspace } = useWorkspace();
  const { data, isLoading, isError, error, refetch } = usePendingApprovals(
    workspace.id
  );
  const decide = useDecideApproval(workspace.id);

  const approvals = data?.approvals ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    approvals.find((a) => a.id === selectedId) ?? approvals[0] ?? null;

  // Editable draft state, reset whenever the selected approval changes.
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    if (selected) {
      setSubject(selected.payload.subject);
      setBody(selected.payload.body);
      setEditing(false);
    }
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDecide = async (decision: 'approve' | 'reject') => {
    if (!selected) return;
    const edited =
      subject !== selected.payload.subject || body !== selected.payload.body;
    try {
      const result = await decide.mutateAsync({
        approvalId: selected.id,
        decision,
        ...(decision === 'approve' && edited
          ? { edited_subject: subject, edited_body: body }
          : {}),
      });
      setSelectedId(null);
      if (decision === 'reject') {
        toast.success('Draft rejected');
        return;
      }
      const sr = result.send_result;
      if (!sr) {
        toast.success('Draft approved');
      } else if (sr.status === 'sent') {
        toast.success('Approved and sent');
      } else if (sr.status === 'blocked') {
        toast.error(
          `Send blocked: ${
            sr.violations?.map((v) => v.detail).join('; ') ||
            'policy violations'
          }`
        );
      } else {
        toast.error(`Send failed${sr.error ? `: ${sr.error}` : ''}`);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to submit decision'
      );
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-56" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_1fr]">
          <Skeleton className="h-96 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="max-w-xl border-destructive/30">
        <CardContent className="py-10 text-center">
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : 'Failed to load approvals'}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => refetch()}
          >
            <RefreshCw className="mr-2 h-3.5 w-3.5" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Approvals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Nothing is sent until you approve it. The queue refreshes every 10 seconds.
          </p>
        </div>
        {approvals.length > 0 && (
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{approvals.length}</span>{' '}
            {approvals.length === 1 ? 'draft' : 'drafts'} waiting
          </p>
        )}
      </header>

      {approvals.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-6 py-14 text-center">
          <Inbox className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No drafts waiting</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Enroll qualified prospects in a campaign sequence and their first emails land here.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_1fr]">
          <ul className="space-y-1" aria-label="Drafts waiting for approval">
            {approvals.map((approval) => (
              <li key={approval.id}>
                <ApprovalListItem
                  approval={approval}
                  active={selected?.id === approval.id}
                  onSelect={() => setSelectedId(approval.id)}
                />
              </li>
            ))}
          </ul>

          {selected && (
            <section aria-label="Selected draft" className="space-y-4">
              {selected.payload.checks_failed && selected.payload.checks_failed.length > 0 ? (
                <div className="rounded-md border border-hold/30 bg-hold/10 p-3 text-sm text-hold">
                  <p className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="h-4 w-4" />
                    This draft failed pre-send checks
                  </p>
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-6">
                    {selected.payload.checks_failed.map((c, i) => (
                      <li key={i}>{c.detail}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="flex items-center gap-2 text-sm text-approve">
                  <Check className="h-4 w-4" />
                  Passed pre-send checks: length, no placeholders, no disallowed claims, valid links and address.
                </p>
              )}

              <article className="rounded-md border border-border bg-card">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-6 py-4">
                  <dl className="grid grid-cols-[3.5rem_1fr] gap-y-1 text-sm">
                    <dt className="text-muted-foreground">To</dt>
                    <dd>
                      <span className="font-medium">
                        {selected.message?.prospect?.full_name ?? 'Unknown prospect'}
                      </span>{' '}
                      <span className="text-muted-foreground">&lt;{selected.payload.to}&gt;</span>
                    </dd>
                    {selected.message?.prospect?.company_name && (
                      <>
                        <dt className="text-muted-foreground">At</dt>
                        <dd>{selected.message.prospect.company_name}</dd>
                      </>
                    )}
                    <dt className="text-muted-foreground">Step</dt>
                    <dd>{selected.message?.step_number ?? 1} of the sequence</dd>
                  </dl>
                  {!editing && (
                    <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                      <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit draft
                    </Button>
                  )}
                </div>

                <div className="space-y-4 px-6 py-5">
                  {editing ? (
                    <>
                      <div className="space-y-1.5">
                        <Label htmlFor="approval-subject">Subject</Label>
                        <Input
                          id="approval-subject"
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="approval-body">Body</Label>
                        <Textarea
                          id="approval-body"
                          rows={14}
                          value={body}
                          onChange={(e) => setBody(e.target.value)}
                          className="font-serif text-base leading-relaxed"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <h2 className="text-lg font-semibold leading-snug">{subject}</h2>
                      <div className="max-w-[62ch] whitespace-pre-wrap font-serif text-[1.0625rem] leading-[1.7] text-foreground">
                        {body}
                      </div>
                    </>
                  )}
                </div>
              </article>

              <RoleGate
                action="approve_drafts"
                fallback={
                  <p className="text-sm text-muted-foreground">
                    Only owners, admins and reviewers can approve drafts.
                  </p>
                }
              >
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    className="bg-approve text-approve-foreground hover:bg-approve/90"
                    disabled={decide.isPending}
                    onClick={() => handleDecide('approve')}
                  >
                    {decide.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-2 h-4 w-4" />
                    )}
                    {editing ? 'Save and send' : 'Approve and send'}
                  </Button>
                  <Button
                    variant="outline"
                    className="border-hold/40 text-hold hover:bg-hold/10 hover:text-hold"
                    disabled={decide.isPending}
                    onClick={() => handleDecide('reject')}
                  >
                    <X className="mr-2 h-4 w-4" /> Reject draft
                  </Button>
                  <p className="basis-full text-xs text-muted-foreground">
                    Sending goes through your connected Gmail. Suppression, the daily cap and
                    duplicate sends are checked again at the moment you approve.
                  </p>
                </div>
              </RoleGate>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function ApprovalListItem({
  approval,
  active,
  onSelect,
}: {
  approval: Approval;
  active: boolean;
  onSelect: () => void;
}) {
  const prospect = approval.message?.prospect;
  const failed = !!approval.payload.checks_failed?.length;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'w-full rounded-md px-3 py-2.5 text-left transition-colors',
        active
          ? 'bg-card shadow-[inset_2px_0_0_hsl(var(--primary))] ring-1 ring-border'
          : 'hover:bg-card/70'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-semibold">{prospect?.full_name ?? 'Unknown prospect'}</p>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(approval.created_at), { addSuffix: true })}
        </span>
      </div>
      {prospect?.company_name && (
        <p className="truncate text-xs text-muted-foreground">{prospect.company_name}</p>
      )}
      <p className="mt-1 truncate text-sm text-muted-foreground">{approval.payload.subject}</p>
      {failed && (
        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-hold">
          <AlertTriangle className="h-3.5 w-3.5" /> Failed checks
        </p>
      )}
    </button>
  );
}
