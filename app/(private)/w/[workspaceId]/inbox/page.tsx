'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  MailQuestion,
  PenLine,
  RefreshCw,
} from 'lucide-react';

import { useWorkspace } from '@/components/providers/workspace-provider';
import { useReplies, useReplyAction } from '@/lib/hooks/use-replies';
import type { Reply, ReplyIntent } from '@/lib/api-types';
import { IntentBadge, INTENT_LABELS } from '@/components/inbox/intent-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';

const INTENTS = Object.keys(INTENT_LABELS) as ReplyIntent[];

export default function InboxPage() {
  const { workspace } = useWorkspace();
  const [intent, setIntent] = useState<ReplyIntent | 'all'>('all');
  const [requiresReview, setRequiresReview] = useState(false);

  const { data, isLoading, isError, error, refetch } = useReplies(
    workspace.id,
    { intent, requiresReview }
  );

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
        <p className="text-sm text-muted-foreground">
          Classified replies from your outreach.
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-4">
        <Select
          value={intent}
          onValueChange={(v) => setIntent(v as ReplyIntent | 'all')}
        >
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Intent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All intents</SelectItem>
            {INTENTS.map((i) => (
              <SelectItem key={i} value={i}>
                {INTENT_LABELS[i]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch
            id="needs-review"
            checked={requiresReview}
            onCheckedChange={setRequiresReview}
          />
          <Label htmlFor="needs-review" className="text-sm font-normal">
            Needs review only
          </Label>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      ) : isError ? (
        <Card className="border-destructive/30">
          <CardContent className="py-10 text-center">
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : 'Failed to load replies'}
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
      ) : !data || data.replies.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <MailQuestion className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No replies match these filters.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.replies.map((reply) => (
            <ReplyCard key={reply.id} reply={reply} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReplyCard({ reply }: { reply: Reply }) {
  const { workspace } = useWorkspace();
  const [expanded, setExpanded] = useState(false);
  const action = useReplyAction(workspace.id);

  const handleDraftFollowup = async () => {
    try {
      await action.mutateAsync({ replyId: reply.id, action: 'draft_followup' });
      toast.success('Follow-up drafted and sent for approval', {
        action: {
          label: 'Review',
          onClick: () => {
            window.location.href = `/w/${workspace.id}/approvals`;
          },
        },
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to draft follow-up'
      );
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{reply.from_email}</p>
            <p className="truncate text-sm text-muted-foreground">
              {reply.subject}
            </p>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(reply.created_at), {
              addSuffix: true,
            })}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <IntentBadge intent={reply.intent} confidence={reply.intent_confidence} />
          {reply.requires_human_review && (
            <Badge
              variant="outline"
              className="border-amber-400 text-amber-700 dark:text-amber-400"
            >
              Needs review
            </Badge>
          )}
          {reply.recommended_action && (
            <span className="text-xs text-muted-foreground">
              Recommended: {reply.recommended_action.replaceAll('_', ' ')}
            </span>
          )}
        </div>

        {expanded && (
          <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm">
            {reply.body}
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <>
                <ChevronUp className="mr-1.5 h-3.5 w-3.5" /> Hide message
              </>
            ) : (
              <>
                <ChevronDown className="mr-1.5 h-3.5 w-3.5" /> Show message
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={action.isPending}
            onClick={handleDraftFollowup}
          >
            {action.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <PenLine className="mr-1.5 h-3.5 w-3.5" />
            )}
            Draft follow-up
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/w/${workspace.id}/approvals`}>Go to approvals</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
