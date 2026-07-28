'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type {
  MeetingDetailResponse,
  MeetingV2,
  MeetingsV2Response,
} from '@/lib/api-types';

export function useMeetings(workspaceId: string, status?: string) {
  return useQuery({
    queryKey: ['meetings-v2', workspaceId, status ?? 'all'],
    queryFn: () =>
      apiFetch<MeetingsV2Response>(
        `/v2/meetings${status && status !== 'all' ? `?status=${status}` : ''}`,
        { workspaceId }
      ),
    enabled: !!workspaceId,
    // Poll while any meeting is still active so completion shows up.
    refetchInterval: (query) =>
      query.state.data?.meetings.some((m) => m.status === 'active')
        ? 15000
        : false,
  });
}

export function useMeetingDetail(workspaceId: string, meetingId: string) {
  return useQuery({
    queryKey: ['meeting-v2', workspaceId, meetingId],
    queryFn: () =>
      apiFetch<MeetingDetailResponse>(`/v2/meetings/${meetingId}`, {
        workspaceId,
      }),
    enabled: !!workspaceId && !!meetingId,
  });
}

export function useAddBot(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      meeting_url: string;
      title: string;
      prospect_id?: string;
      campaign_id?: string;
    }) =>
      apiFetch<{ meeting: MeetingV2 }>('/v2/meetings/add-bot', {
        method: 'POST',
        body,
        workspaceId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings-v2', workspaceId] });
    },
  });
}

export function useActionItemStatus(workspaceId: string, meetingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemId,
      status,
    }: {
      itemId: string;
      status: 'open' | 'done';
    }) =>
      apiFetch(`/v2/meetings/${meetingId}/action-items/${itemId}/status`, {
        method: 'POST',
        body: { status },
        workspaceId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['meeting-v2', workspaceId, meetingId],
      });
    },
  });
}
