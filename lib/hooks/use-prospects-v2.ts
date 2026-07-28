'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type {
  ProspectDossier,
  ProspectV2,
  ProspectV2Status,
  ProspectsV2Response,
} from '@/lib/api-types';

export interface ProspectsV2Filters {
  campaignId?: string;
  status?: ProspectV2Status | 'all';
}

export function useProspectsV2(
  workspaceId: string,
  filters: ProspectsV2Filters = {},
  options: { poll?: boolean } = {}
) {
  const { campaignId, status } = filters;
  const params = new URLSearchParams();
  if (campaignId) params.set('campaign_id', campaignId);
  if (status && status !== 'all') params.set('status', status);
  const qs = params.toString();

  return useQuery({
    queryKey: ['prospects-v2', workspaceId, campaignId ?? null, status ?? 'all'],
    queryFn: () =>
      apiFetch<ProspectsV2Response>(`/v2/prospects${qs ? `?${qs}` : ''}`, {
        workspaceId,
      }),
    enabled: !!workspaceId,
    refetchInterval: options.poll ? 5000 : false,
  });
}

export function useProspectDossier(workspaceId: string, prospectId: string) {
  return useQuery({
    queryKey: ['prospect-dossier', workspaceId, prospectId],
    queryFn: () =>
      apiFetch<ProspectDossier>(`/v2/prospects/${prospectId}`, { workspaceId }),
    enabled: !!workspaceId && !!prospectId,
  });
}

export function useOverrideProspectStatus(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      prospectId,
      status,
    }: {
      prospectId: string;
      status: ProspectV2Status;
    }) =>
      apiFetch<{ prospect: ProspectV2 }>(`/v2/prospects/${prospectId}/status`, {
        method: 'POST',
        body: { status },
        workspaceId,
      }),
    onSuccess: (_data, { prospectId }) => {
      queryClient.invalidateQueries({
        queryKey: ['prospect-dossier', workspaceId, prospectId],
      });
      queryClient.invalidateQueries({ queryKey: ['prospects-v2', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['campaigns', workspaceId] });
    },
  });
}
