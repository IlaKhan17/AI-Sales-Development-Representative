'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type {
  IcpDefinition,
  IcpProfile,
  IcpProfilesResponse,
  IcpVersion,
  IcpWeights,
} from '@/lib/api-types';

export function useIcpProfiles(workspaceId: string) {
  return useQuery({
    queryKey: ['icp', workspaceId],
    queryFn: async () => {
      // Backend nests versions under the Supabase relation name `icp_versions`;
      // normalize to `versions` so components stay backend-agnostic.
      const data = await apiFetch<{
        profiles: Array<Omit<IcpProfile, 'versions'> & { icp_versions?: IcpVersion[] }>;
      }>('/icp', { workspaceId });
      const profiles: IcpProfile[] = data.profiles.map((p) => {
        const { icp_versions, ...rest } = p;
        return { ...rest, versions: icp_versions ?? [] };
      });
      return { profiles } satisfies IcpProfilesResponse;
    },
    enabled: !!workspaceId,
  });
}

export function useCreateIcpProfile(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string }) =>
      apiFetch<{ profile: IcpProfile }>('/icp', {
        method: 'POST',
        body,
        workspaceId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['icp', workspaceId] });
    },
  });
}

export function useCreateIcpVersion(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      profileId,
      definition,
      weights,
    }: {
      profileId: string;
      definition: IcpDefinition;
      weights: IcpWeights;
    }) =>
      apiFetch<{ version: IcpVersion }>(`/icp/${profileId}/versions`, {
        method: 'POST',
        body: { definition, weights },
        workspaceId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['icp', workspaceId] });
    },
  });
}

export function useActivateIcpVersion(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      profileId,
      versionId,
    }: {
      profileId: string;
      versionId: string;
    }) =>
      apiFetch<unknown>(`/icp/${profileId}/versions/${versionId}`, {
        method: 'PATCH',
        body: { status: 'active' },
        workspaceId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['icp', workspaceId] });
    },
  });
}
