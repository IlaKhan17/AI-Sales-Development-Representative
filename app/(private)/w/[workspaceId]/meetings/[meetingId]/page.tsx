'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowLeft, Sparkles } from 'lucide-react';

import { useWorkspace } from '@/components/providers/workspace-provider';
import { useActionItemStatus, useMeetingDetail } from '@/lib/hooks/use-meetings';
import { PageHeader } from '@/components/page-header';
import { cn } from '@/lib/utils';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';

/** A labelled row of findings: what the buyer said about one topic. */
function FindingRow({ label, items, empty }: { label: string; items: string[]; empty: string }) {
  return (
    <div className="grid gap-2 px-5 py-4 sm:grid-cols-[11rem_1fr] sm:gap-6">
      <dt className="text-sm font-medium">{label}</dt>
      <dd>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="list-disc space-y-1 pl-4 text-sm leading-relaxed">
            {items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        )}
      </dd>
    </div>
  );
}

const STATUS_TONES: Record<string, string> = {
  completed: 'border-border bg-card text-foreground',
  failed: 'border-hold/30 bg-hold/10 text-hold',
  active: 'border-approve/30 bg-approve/10 text-approve',
};

export default function MeetingDetailPage() {
  const { workspace } = useWorkspace();
  const params = useParams<{ meetingId: string }>();
  const meetingId = params.meetingId;

  const detail = useMeetingDetail(workspace.id, meetingId);
  const setStatus = useActionItemStatus(workspace.id, meetingId);

  if (detail.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          This meeting doesn&apos;t exist in this workspace.
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/w/${workspace.id}/meetings`}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> All meetings
          </Link>
        </Button>
      </div>
    );
  }

  const { meeting, transcript, insights, action_items: actionItems } = detail.data;
  const openCount = actionItems.filter((i) => i.status !== 'done').length;

  return (
    <div className="space-y-8">
      <PageHeader
        back={{ href: `/w/${workspace.id}/meetings`, label: 'All meetings' }}
        title={meeting.title}
        status={
          <span
            className={cn(
              'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize',
              STATUS_TONES[meeting.status] ?? 'border-dashed border-border text-muted-foreground'
            )}
          >
            {meeting.status === 'active' ? 'Recording' : meeting.status}
          </span>
        }
        description={
          <>
            {format(new Date(meeting.created_at), 'PPp')}
            {meeting.duration_minutes ? `, ${meeting.duration_minutes} minutes` : ''}
          </>
        }
      />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="space-y-10">
          {!insights ? (
            <div className="rounded-md border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
              <Sparkles className="mx-auto mb-2 h-6 w-6" />
              Davis analyses the call once it ends. The summary and findings appear here then.
            </div>
          ) : (
            <>
              <section aria-labelledby="summary-heading">
                <h2 id="summary-heading" className="text-lg font-semibold">
                  Summary
                </h2>
                <p className="mt-2 max-w-[68ch] text-base leading-relaxed">
                  {insights.summary || 'No summary was produced for this call.'}
                </p>
                {insights.timeline && (
                  <p className="mt-3 text-sm">
                    <span className="font-medium">Their timeline:</span>{' '}
                    <span className="text-muted-foreground">{insights.timeline}</span>
                  </p>
                )}
              </section>

              <section aria-labelledby="objections-heading" className="space-y-3">
                <h2 id="objections-heading" className="text-lg font-semibold">
                  Objections
                </h2>
                {insights.objections.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No objections were raised.</p>
                ) : (
                  <div className="space-y-3">
                    {insights.objections.map((o, i) => (
                      <figure
                        key={i}
                        className="rounded-md border border-border border-l-caution bg-card px-5 py-4"
                        style={{ borderLeftWidth: 3 }}
                      >
                        <blockquote className="font-serif text-base leading-relaxed">
                          {o.text}
                        </blockquote>
                        {o.speaker && (
                          <figcaption className="mt-2 text-xs text-muted-foreground">
                            Said by {o.speaker}
                          </figcaption>
                        )}
                      </figure>
                    ))}
                  </div>
                )}
              </section>

              <section aria-labelledby="findings-heading" className="space-y-3">
                <h2 id="findings-heading" className="text-lg font-semibold">
                  What else came up
                </h2>
                <dl className="divide-y divide-border rounded-md border border-border bg-card">
                  <div className="grid gap-2 px-5 py-4 sm:grid-cols-[11rem_1fr] sm:gap-6">
                    <dt className="text-sm font-medium">Competitors</dt>
                    <dd>
                      {insights.competitors.length === 0 ? (
                        <p className="text-sm text-muted-foreground">None mentioned.</p>
                      ) : (
                        <ul className="space-y-2 text-sm">
                          {insights.competitors.map((c, i) => (
                            <li key={i}>
                              <span className="font-medium">{c.name}</span>
                              {c.context && (
                                <span className="text-muted-foreground">: {c.context}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </dd>
                  </div>
                  <FindingRow label="Budget" items={insights.budget_signals} empty="Not discussed." />
                  <FindingRow
                    label="How they'll decide"
                    items={insights.decision_criteria}
                    empty="Not discussed."
                  />
                  <FindingRow label="Requirements" items={insights.requirements} empty="None stated." />
                  <FindingRow
                    label="Their questions"
                    items={insights.questions_asked}
                    empty="No questions asked."
                  />
                </dl>
              </section>
            </>
          )}

          {transcript?.transcript && (
            <Accordion type="single" collapsible>
              <AccordionItem value="transcript" className="rounded-md border border-border bg-card px-5">
                <AccordionTrigger className="text-sm font-semibold">Full transcript</AccordionTrigger>
                <AccordionContent>
                  <div className="max-h-[32rem] overflow-y-auto whitespace-pre-wrap font-serif text-[0.95rem] leading-relaxed">
                    {transcript.transcript}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        </div>

        <aside aria-labelledby="actions-heading" className="lg:sticky lg:top-8 lg:self-start">
          <h2 id="actions-heading" className="text-lg font-semibold">
            Action items
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            {actionItems.length === 0
              ? insights
                ? 'None were captured on this call.'
                : 'They appear after the call is analysed.'
              : `${openCount} of ${actionItems.length} still open.`}
          </p>
          {actionItems.length > 0 && (
            <ul className="divide-y divide-border rounded-md border border-border bg-card">
              {actionItems.map((item) => (
                <li key={item.id}>
                  <label className="flex cursor-pointer items-start gap-3 px-4 py-3">
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
                    <span className="min-w-0 text-sm">
                      <span
                        className={cn(item.status === 'done' && 'text-muted-foreground line-through')}
                      >
                        {item.description}
                      </span>
                      {(item.owner || item.due_hint) && (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {[item.owner && `Owner: ${item.owner}`, item.due_hint && `Due: ${item.due_hint}`]
                            .filter(Boolean)
                            .join(', ')}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
