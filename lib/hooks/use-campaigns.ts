'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type {
  Campaign,
  CampaignDetailResponse,
  CampaignsResponse,
  CreateCampaignRequest,
} from '@/lib/api-types';

export function useCampaigns(workspaceId: string) {
  return useQuery({
    queryKey: ['campaigns', workspaceId],
    queryFn: () => apiFetch<CampaignsResponse>('/campaigns', { workspaceId }),
    enabled: !!workspaceId,
    refetchInterval: (query) =>
      query.state.data?.campaigns.some((c) => c.status === 'running')
        ? 5000
        : false,
  });
}

export function useCampaign(workspaceId: string, campaignId: string) {
  return useQuery({
    queryKey: ['campaigns', workspaceId, campaignId],
    queryFn: () =>
      apiFetch<CampaignDetailResponse>(`/campaigns/${campaignId}`, {
        workspaceId,
      }),
    enabled: !!workspaceId && !!campaignId,
    refetchInterval: (query) =>
      query.state.data?.campaign.status === 'running' ? 5000 : false,
  });
}

export function useCreateCampaign(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCampaignRequest) =>
      apiFetch<{ campaign: Campaign }>('/campaigns', {
        method: 'POST',
        body,
        workspaceId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', workspaceId] });
    },
  });
}

export function useStartCampaign(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (campaignId: string) =>
      apiFetch<{ run_id: string }>(`/campaigns/${campaignId}/start`, {
        method: 'POST',
        workspaceId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', workspaceId] });
    },
  });
}

export function usePauseCampaign(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (campaignId: string) =>
      apiFetch<{ campaign: Campaign }>(`/campaigns/${campaignId}/pause`, {
        method: 'POST',
        workspaceId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', workspaceId] });
    },
  });
}
