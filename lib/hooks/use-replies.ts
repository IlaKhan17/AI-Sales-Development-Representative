'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type {
  RepliesV2Response,
  ReplyIntent,
} from '@/lib/api-types';

export interface ReplyFilters {
  intent?: ReplyIntent | 'all';
  requiresReview?: boolean;
}

export function useReplies(workspaceId: string, filters: ReplyFilters = {}) {
  const { intent, requiresReview } = filters;
  const params = new URLSearchParams();
  if (intent && intent !== 'all') params.set('intent', intent);
  if (requiresReview) params.set('requires_review', 'true');
  const qs = params.toString();

  return useQuery({
    queryKey: ['replies', workspaceId, intent ?? 'all', requiresReview ?? false],
    queryFn: () =>
      apiFetch<RepliesV2Response>(`/replies${qs ? `?${qs}` : ''}`, {
        workspaceId,
      }),
    enabled: !!workspaceId,
  });
}

export function useReplyAction(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      replyId,
      action,
    }: {
      replyId: string;
      action: 'draft_followup';
    }) =>
      apiFetch<{
        approval?: { id: string } | null;
        message?: { id: string };
        checks_failed?: Array<{ code: string; detail: string }>;
      }>(`/replies/${replyId}/action`, {
        method: 'POST',
        body: { action },
        workspaceId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['approvals', workspaceId, 'pending'],
      });
      queryClient.invalidateQueries({
        queryKey: ['approval-counts', workspaceId],
      });
    },
  });
}
