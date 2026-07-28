'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CircleDollarSign,
  ClipboardList,
  FileText,
  HelpCircle,
  Hourglass,
  ListChecks,
  Scale,
  Sparkles,
} from 'lucide-react';

import { useWorkspace } from '@/components/providers/workspace-provider';
import {
  useActionItemStatus,
  useMeetingDetail,
} from '@/lib/hooks/use-meetings';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';

function InsightList({
  title,
  icon: Icon,
  items,
}: {
  title: string;
  icon: typeof Sparkles;
  items: string[];
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">None mentioned.</p>
        ) : (
          <ul className="list-disc space-y-1 pl-4 text-sm">
            {items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function MeetingDetailPage() {
  const { workspace } = useWorkspace();
  const params = useParams<{ meetingId: string }>();
  const meetingId = params.meetingId;

  const detail = useMeetingDetail(workspace.id, meetingId);
  const setStatus = useActionItemStatus(workspace.id, meetingId);

  if (detail.isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Meeting not found.
      </div>
    );
  }

  const { meeting, transcript, insights, action_items: actionItems } =
    detail.data;

  return (
    <div className="space-y-6 p-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href={`/w/${workspace.id}/meetings`}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Meetings
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {meeting.title}
          </h1>
          <Badge
            variant={
              meeting.status === 'completed'
                ? 'default'
                : meeting.status === 'failed'
                  ? 'destructive'
                  : 'outline'
            }
          >
            {meeting.status}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {format(new Date(meeting.created_at), 'PPp')}
          {meeting.duration_minutes ? ` · ${meeting.duration_minutes} min` : ''}
        </p>
      </div>

      {!insights ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <Sparkles className="mx-auto mb-2 h-6 w-6" />
            Analysis pending — insights appear after the meeting completes.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4" /> Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed">
                {insights.summary || 'No summary available.'}
              </p>
              {insights.timeline && (
                <p className="mt-3 flex items-center gap-2 text-sm">
                  <Hourglass className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Timeline:</span>
                  {insights.timeline}
                </p>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Objections — amber cards */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Objections
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {insights.objections.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No objections raised.
                  </p>
                ) : (
                  insights.objections.map((o, i) => (
                    <div
                      key={i}
                      className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40"
                    >
                      <p>{o.text}</p>
                      {o.speaker && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          — {o.speaker}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Competitors */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <Building2 className="h-4 w-4" /> Competitors
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {insights.competitors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No competitors mentioned.
                  </p>
                ) : (
                  insights.competitors.map((c, i) => (
                    <div key={i} className="rounded-md border p-3 text-sm">
                      <p className="font-medium">{c.name}</p>
                      <p className="mt-0.5 text-muted-foreground">
                        {c.context}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <InsightList
              title="Budget signals"
              icon={CircleDollarSign}
              items={insights.budget_signals}
            />
            <InsightList
              title="Decision criteria"
              icon={Scale}
              items={insights.decision_criteria}
            />
            <InsightList
              title="Requirements"
              icon={ClipboardList}
              items={insights.requirements}
            />
            <InsightList
              title="Questions asked"
              icon={HelpCircle}
              items={insights.questions_asked}
            />
          </div>
        </>
      )}

      {/* Action items */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <ListChecks className="h-4 w-4" /> Action items
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {actionItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {insights
                ? 'No action items were captured.'
                : 'Action items appear after the meeting is analyzed.'}
            </p>
          ) : (
            actionItems.map((item) => (
              <label
                key={item.id}
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3"
              >
                <Checkbox
                  checked={item.status === 'done'}
                  disabled={setStatus.isPending}
                  onCheckedChange={(v) =>
                    setStatus.mutate({
                      itemId: item.id,
                      status: v === true ? 'done' : 'open',
                    })
                  }
                  className="mt-0.5"
                />
                <span
                  className={
                    item.status === 'done'
                      ? 'text-sm text-muted-foreground line-through'
                      : 'text-sm'
                  }
                >
                  {item.description}
                  {(item.owner || item.due_hint) && (
                    <span className="ml-2 text-xs text-muted-foreground no-underline">
                      {item.owner ? `Owner: ${item.owner}` : ''}
                      {item.owner && item.due_hint ? ' · ' : ''}
                      {item.due_hint ?? ''}
                    </span>
                  )}
                </span>
              </label>
            ))
          )}
        </CardContent>
      </Card>

      {/* Transcript */}
      {transcript?.transcript && (
        <Accordion type="single" collapsible>
          <AccordionItem value="transcript" className="rounded-lg border px-4">
            <AccordionTrigger className="text-sm font-medium">
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4" /> Transcript
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted p-4 font-mono text-xs leading-relaxed">
                {transcript.transcript}
              </pre>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
}
