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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Approvals</h1>
        <p className="text-sm text-muted-foreground">
          Review outbound drafts before they are sent. Refreshes every 10 seconds.
        </p>
      </div>

      {approvals.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No drafts waiting for approval
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_1fr]">
          {/* List */}
          <div className="space-y-2">
            {approvals.map((approval) => (
              <ApprovalListItem
                key={approval.id}
                approval={approval}
                active={selected?.id === approval.id}
                onSelect={() => setSelectedId(approval.id)}
              />
            ))}
          </div>

          {/* Detail */}
          {selected && (
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      {selected.message?.prospect?.full_name ?? 'Unknown prospect'}
                      {selected.message?.prospect?.company_name && (
                        <span className="text-muted-foreground">
                          {' '}
                          · {selected.message.prospect.company_name}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      To: {selected.payload.to}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      Step {selected.message?.step_number ?? 1}
                    </Badge>
                    {!editing && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditing(true)}
                      >
                        <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                      </Button>
                    )}
                  </div>
                </div>

                {selected.payload.checks_failed &&
                  selected.payload.checks_failed.length > 0 && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Pre-send checks failed</AlertTitle>
                      <AlertDescription>
                        <ul className="mt-1 list-disc space-y-1 pl-4">
                          {selected.payload.checks_failed.map((c, i) => (
                            <li key={i}>
                              <span className="font-mono text-xs">{c.code}</span>
                              {' — '}
                              {c.detail}
                            </li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}

                <div className="space-y-1.5">
                  <Label htmlFor="approval-subject">Subject</Label>
                  <Input
                    id="approval-subject"
                    value={subject}
                    readOnly={!editing}
                    onChange={(e) => setSubject(e.target.value)}
                    className={cn(!editing && 'bg-muted/50')}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="approval-body">Body</Label>
                  <Textarea
                    id="approval-body"
                    rows={12}
                    value={body}
                    readOnly={!editing}
                    onChange={(e) => setBody(e.target.value)}
                    className={cn(!editing && 'bg-muted/50')}
                  />
                </div>

                <RoleGate
                  action="approve_drafts"
                  fallback={
                    <p className="text-xs text-muted-foreground">
                      You do not have permission to approve drafts.
                    </p>
                  }
                >
                  <div className="flex gap-2">
                    <Button
                      className="bg-emerald-600 text-white hover:bg-emerald-700"
                      disabled={decide.isPending}
                      onClick={() => handleDecide('approve')}
                    >
                      {decide.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="mr-2 h-4 w-4" />
                      )}
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      disabled={decide.isPending}
                      onClick={() => handleDecide('reject')}
                    >
                      <X className="mr-2 h-4 w-4" /> Reject
                    </Button>
                  </div>
                </RoleGate>
              </CardContent>
            </Card>
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
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-lg border p-3 text-left transition-colors',
        active
          ? 'border-primary bg-primary/5'
          : 'border-border hover:bg-muted/50'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-medium">
          {prospect?.full_name ?? 'Unknown prospect'}
          {prospect?.company_name && (
            <span className="font-normal text-muted-foreground">
              {' '}
              · {prospect.company_name}
            </span>
          )}
        </p>
        {approval.payload.checks_failed &&
          approval.payload.checks_failed.length > 0 && (
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          )}
      </div>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">
        {approval.payload.subject}
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        <Badge variant="secondary" className="text-[10px]">
          Step {approval.message?.step_number ?? 1}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(approval.created_at), {
            addSuffix: true,
          })}
        </span>
      </div>
    </button>
  );
}
