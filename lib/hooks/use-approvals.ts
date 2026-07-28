'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type {
  ApprovalCountsResponse,
  ApprovalsResponse,
  DecideApprovalRequest,
  DecideApprovalResponse,
} from '@/lib/api-types';

export function usePendingApprovals(workspaceId: string) {
  return useQuery({
    queryKey: ['approvals', workspaceId, 'pending'],
    queryFn: () =>
      apiFetch<ApprovalsResponse>('/approvals?status=pending', { workspaceId }),
    enabled: !!workspaceId,
    refetchInterval: 10_000,
  });
}

export function useApprovalCounts(workspaceId: string) {
  return useQuery({
    queryKey: ['approval-counts', workspaceId],
    queryFn: () =>
      apiFetch<ApprovalCountsResponse>('/approvals/counts', { workspaceId }),
    enabled: !!workspaceId,
    refetchInterval: 30_000,
  });
}

export function useDecideApproval(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      approvalId,
      ...body
    }: DecideApprovalRequest & { approvalId: string }) =>
      apiFetch<DecideApprovalResponse>(`/approvals/${approvalId}/decide`, {
        method: 'POST',
        body,
        workspaceId,
      }),
    // Optimistically remove the approval from the pending list.
    onMutate: async ({ approvalId }) => {
      const key = ['approvals', workspaceId, 'pending'];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ApprovalsResponse>(key);
      if (previous) {
        queryClient.setQueryData<ApprovalsResponse>(key, {
          approvals: previous.approvals.filter((a) => a.id !== approvalId),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          ['approvals', workspaceId, 'pending'],
          context.previous
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ['approvals', workspaceId, 'pending'],
      });
      queryClient.invalidateQueries({
        queryKey: ['approval-counts', workspaceId],
      });
    },
  });
}
