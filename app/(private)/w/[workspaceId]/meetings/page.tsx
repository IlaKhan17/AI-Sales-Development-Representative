'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Bot,
  CalendarDays,
  Clock,
  Loader2,
  Plus,
  Sparkles,
  Video,
} from 'lucide-react';

import { useWorkspace } from '@/components/providers/workspace-provider';
import { useAddBot, useMeetings } from '@/lib/hooks/use-meetings';
import { useAvailability, useCreateEvent } from '@/lib/hooks/use-calendar';
import { useProspectsV2 } from '@/lib/hooks/use-prospects-v2';
import { ApiError } from '@/lib/api';
import type { AvailabilitySlot, MeetingV2 } from '@/lib/api-types';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
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
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ListInput } from '@/components/ui-extras/list-input';

function MeetingRow({
  meeting,
  workspaceId,
}: {
  meeting: MeetingV2;
  workspaceId: string;
}) {
  return (
    <Link
      href={`/w/${workspaceId}/meetings/${meeting.id}`}
      className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {meeting.status === 'active' && (
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
          )}
          <p className="truncate font-medium">{meeting.title}</p>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {format(new Date(meeting.created_at), 'PPp')}
          {meeting.duration_minutes ? ` · ${meeting.duration_minutes} min` : ''}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {meeting.has_insights && (
          <Badge variant="secondary" className="gap-1">
            <Sparkles className="h-3 w-3" /> Insights
          </Badge>
        )}
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
    </Link>
  );
}

export default function MeetingsPage() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace.id;

  const meetingsQuery = useMeetings(workspaceId);
  const addBot = useAddBot(workspaceId);
  const prospectsQuery = useProspectsV2(workspaceId, { status: 'qualified' });

  // Add-bot dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [meetingUrl, setMeetingUrl] = useState('');
  const [title, setTitle] = useState('');
  const [prospectId, setProspectId] = useState<string>('none');

  // Calendar / booking state
  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    []
  );
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    new Date()
  );
  const [duration, setDuration] = useState(30);
  const dateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;
  const availability = useAvailability(workspaceId, dateStr, duration, timezone);
  const createEvent = useCreateEvent(workspaceId);

  const [bookOpen, setBookOpen] = useState(false);
  const [slot, setSlot] = useState<AvailabilitySlot | null>(null);
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [attendees, setAttendees] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);

  const meetings = meetingsQuery.data?.meetings ?? [];
  const active = meetings.filter((m) => m.status === 'active');
  const rest = meetings.filter((m) => m.status !== 'active');

  const handleAddBot = async () => {
    try {
      await addBot.mutateAsync({
        meeting_url: meetingUrl.trim(),
        title: title.trim() || 'Untitled Meeting',
        prospect_id: prospectId !== 'none' ? prospectId : undefined,
      });
      toast.success('Notetaker bot is joining the meeting');
      setAddOpen(false);
      setMeetingUrl('');
      setTitle('');
      setProspectId('none');
    } catch (e) {
      toast.error(
        e instanceof ApiError ? String(e.detail) : 'Failed to add bot'
      );
    }
  };

  const handleBook = async () => {
    if (!slot) return;
    try {
      const res = await createEvent.mutateAsync({
        summary: summary.trim() || 'Meeting',
        description,
        start_time: slot.start,
        end_time: slot.end,
        attendees: attendees.length ? attendees : undefined,
        confirmed,
      });
      toast.success('Meeting booked', {
        description: res.event.htmlLink,
        action: res.event.htmlLink
          ? {
              label: 'Open',
              onClick: () => window.open(res.event.htmlLink, '_blank'),
            }
          : undefined,
      });
      setBookOpen(false);
      setSlot(null);
      setSummary('');
      setDescription('');
      setAttendees([]);
      setConfirmed(false);
      availability.refetch();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast.error('Time conflict', { description: String(e.detail) });
      } else if (e instanceof ApiError && e.status === 422) {
        toast.error('Confirmation required', { description: String(e.detail) });
      } else {
        toast.error(
          e instanceof ApiError ? String(e.detail) : 'Failed to book meeting'
        );
      }
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Meetings</h1>
          <p className="text-sm text-muted-foreground">
            Send the AI notetaker to calls and book time with prospects.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Bot
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Meetings list */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="h-4 w-4" /> Recorded meetings
            </CardTitle>
            <CardDescription>
              Completed meetings link to their sales insights.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {meetingsQuery.isLoading ? (
              <>
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </>
            ) : meetings.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                <Bot className="mx-auto mb-2 h-6 w-6" />
                No meetings yet. Add the bot to your next call.
              </div>
            ) : (
              <>
                {active.map((m) => (
                  <MeetingRow key={m.id} meeting={m} workspaceId={workspaceId} />
                ))}
                {rest.map((m) => (
                  <MeetingRow key={m.id} meeting={m} workspaceId={workspaceId} />
                ))}
              </>
            )}
          </CardContent>
        </Card>

        {/* Calendar booking */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" /> Book a meeting
            </CardTitle>
            <CardDescription>
              Availability from your Google Calendar ({timezone}).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                className="rounded-md border"
              />
              <div className="flex-1 space-y-3">
                <div className="space-y-1.5">
                  <Label>Duration</Label>
                  <Select
                    value={String(duration)}
                    onValueChange={(v) => setDuration(Number(v))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15 minutes</SelectItem>
                      <SelectItem value="30">30 minutes</SelectItem>
                      <SelectItem value="45">45 minutes</SelectItem>
                      <SelectItem value="60">60 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" /> Available slots
                  </Label>
                  {availability.isLoading ? (
                    <Skeleton className="h-24 w-full" />
                  ) : availability.isError ? (
                    <p className="text-sm text-muted-foreground">
                      Could not load availability — is Google Calendar
                      connected?
                    </p>
                  ) : (availability.data?.slots.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No free slots on this day.
                    </p>
                  ) : (
                    <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto pr-1">
                      {availability.data!.slots.map((s) => (
                        <Button
                          key={s.start}
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSlot(s);
                            setBookOpen(true);
                          }}
                        >
                          {format(new Date(s.start), 'HH:mm')}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add Bot dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add notetaker bot</DialogTitle>
            <DialogDescription>
              The bot joins the meeting, records it and extracts sales
              insights.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="meeting-url">Meeting URL</Label>
              <Input
                id="meeting-url"
                placeholder="https://meet.google.com/..."
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="meeting-title">Title</Label>
              <Input
                id="meeting-title"
                placeholder="Discovery call with Acme"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Prospect (optional)</Label>
              <Select value={prospectId} onValueChange={setProspectId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Link a qualified prospect" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No prospect</SelectItem>
                  {(prospectsQuery.data?.prospects ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name || p.email || p.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddBot}
              disabled={!meetingUrl.trim() || addBot.isPending}
            >
              {addBot.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Add bot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Booking dialog */}
      <Dialog open={bookOpen} onOpenChange={setBookOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Book meeting</DialogTitle>
            <DialogDescription>
              {slot
                ? `${format(new Date(slot.start), 'PPp')} – ${format(new Date(slot.end), 'p')} (${timezone})`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="event-summary">Summary</Label>
              <Input
                id="event-summary"
                placeholder="Intro call"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event-description">Description</Label>
              <Textarea
                id="event-description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Attendee emails</Label>
              <ListInput
                value={attendees}
                onChange={setAttendees}
                placeholder="prospect@company.com"
              />
            </div>
            {attendees.length > 0 && (
              <label className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm">
                <Checkbox
                  checked={confirmed}
                  onCheckedChange={(v) => setConfirmed(v === true)}
                  className="mt-0.5"
                />
                <span>
                  I confirm booking with external attendees — invitations will
                  be emailed to them.
                </span>
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBookOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleBook}
              disabled={
                !summary.trim() ||
                createEvent.isPending ||
                (attendees.length > 0 && !confirmed)
              }
            >
              {createEvent.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Book
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
