'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type {
  AvailabilityResponse,
  CalendarEventCreated,
} from '@/lib/api-types';

export function useAvailability(
  workspaceId: string,
  date: string | null,
  durationMinutes: number,
  timezone: string
) {
  return useQuery({
    queryKey: ['calendar-availability', date, durationMinutes, timezone],
    queryFn: () =>
      apiFetch<AvailabilityResponse>(
        `/calendar/availability?date=${date}&duration_minutes=${durationMinutes}&timezone=${encodeURIComponent(timezone)}`,
        { workspaceId }
      ),
    enabled: !!workspaceId && !!date,
  });
}

export interface CreateEventBody {
  summary: string;
  start_time: string;
  end_time: string;
  description?: string;
  attendees?: string[];
  location?: string;
  confirmed?: boolean;
}

export function useCreateEvent(workspaceId: string) {
  return useMutation({
    mutationFn: (body: CreateEventBody) =>
      apiFetch<{ status: string; event: CalendarEventCreated }>(
        '/calendar/events',
        { method: 'POST', body, workspaceId }
      ),
  });
}
