'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { SuppressionEntry, SuppressionResponse } from '@/lib/api-types';

export function useSuppression(workspaceId: string) {
  return useQuery({
    queryKey: ['suppression', workspaceId],
    queryFn: () => apiFetch<SuppressionResponse>('/suppression', { workspaceId }),
    enabled: !!workspaceId,
  });
}

export function useAddSuppression(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; reason: 'manual' }) =>
      apiFetch<{ entry?: SuppressionEntry }>('/suppression', {
        method: 'POST',
        body,
        workspaceId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppression', workspaceId] });
    },
  });
}

export function useRemoveSuppression(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) =>
      apiFetch<unknown>(`/suppression/${entryId}`, {
        method: 'DELETE',
        workspaceId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppression', workspaceId] });
    },
  });
}
