'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type {
  CreateSequenceRequest,
  EnrollResponse,
  EnrollmentsResponse,
  Sequence,
  SequencesResponse,
} from '@/lib/api-types';

export function useSequences(workspaceId: string, campaignId: string) {
  return useQuery({
    queryKey: ['sequences', workspaceId, campaignId],
    queryFn: () =>
      apiFetch<SequencesResponse>(`/sequences?campaign_id=${campaignId}`, {
        workspaceId,
      }),
    enabled: !!workspaceId && !!campaignId,
  });
}

export function useCreateSequence(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSequenceRequest) =>
      apiFetch<{ sequence: Sequence }>('/sequences', {
        method: 'POST',
        body,
        workspaceId,
      }),
    onSuccess: (_data, { campaign_id }) => {
      queryClient.invalidateQueries({
        queryKey: ['sequences', workspaceId, campaign_id],
      });
    },
  });
}

export function useEnrollProspects(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      sequenceId,
      prospectIds,
    }: {
      sequenceId: string;
      prospectIds: string[];
    }) =>
      apiFetch<{
        results: Array<{
          prospect_id: string;
          status: 'enrolled' | 'skipped' | 'error';
          enrollment_id?: string;
          message_id?: string;
        }>;
      }>(`/sequences/${sequenceId}/enroll`, {
        method: 'POST',
        body: { prospect_ids: prospectIds },
        workspaceId,
      }).then(
        (data): EnrollResponse => ({
          enrolled: data.results.filter((r) => r.status === 'enrolled').length,
          drafts_created: data.results.filter((r) => r.message_id).length,
        })
      ),
    onSuccess: (_data, { sequenceId }) => {
      queryClient.invalidateQueries({
        queryKey: ['enrollments', workspaceId, sequenceId],
      });
      queryClient.invalidateQueries({
        queryKey: ['approval-counts', workspaceId],
      });
      queryClient.invalidateQueries({
        queryKey: ['approvals', workspaceId, 'pending'],
      });
    },
  });
}

export function useEnrollments(workspaceId: string, sequenceId: string) {
  return useQuery({
    queryKey: ['enrollments', workspaceId, sequenceId],
    queryFn: () =>
      apiFetch<EnrollmentsResponse>(`/sequences/${sequenceId}/enrollments`, {
        workspaceId,
      }),
    enabled: !!workspaceId && !!sequenceId,
  });
}
