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
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';
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
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Inbox"
        description="Replies to your outreach, sorted by what they ask of you. Any reply stops that prospect's sequence; unsubscribes are suppressed automatically."
      />

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
            Needs a person only
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
        <div className="rounded-md border border-hold/30 bg-hold/10 py-10 text-center">
          <div>
            <p className="text-sm text-hold">
              {error instanceof Error ? error.message : "Couldn't load replies."}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => refetch()}
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" /> Retry
            </Button>
          </div>
        </div>
      ) : !data || data.replies.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-6 py-14 text-center">
          <MailQuestion className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">
            {intent !== 'all' || requiresReview ? 'No replies match these filters' : 'No replies yet'}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Davis checks Gmail every 10 minutes, so a reply shows up here within about 10 minutes of arriving.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border bg-card">
          {data.replies.map((reply) => (
            <li key={reply.id}>
              <ReplyCard reply={reply} />
            </li>
          ))}
        </ul>
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
      toast.success('Follow-up drafted and waiting for approval', {
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
    <article className="space-y-3 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{reply.from_email}</p>
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
            <span className="inline-flex rounded-full border border-dashed border-caution/50 px-2 py-0.5 text-xs font-medium text-caution">
              Needs a person
            </span>
          )}
          {reply.recommended_action && (
            <span className="text-xs text-muted-foreground">
              Suggested next step: {reply.recommended_action.replaceAll('_', ' ')}
            </span>
          )}
        </div>

        {expanded && (
          <blockquote className="max-w-[62ch] whitespace-pre-wrap border-l-2 border-border pl-4 font-serif text-base leading-relaxed">
            {reply.body}
          </blockquote>
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
            <Link href={`/w/${workspace.id}/approvals`}>Open approvals</Link>
          </Button>
        </div>
    </article>
  );
}
