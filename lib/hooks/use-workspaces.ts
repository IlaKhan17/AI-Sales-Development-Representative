'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type {
  CreateWorkspaceRequest,
  CreateWorkspaceResponse,
  ProductProfile,
  WorkspaceDetailResponse,
  WorkspacesResponse,
} from '@/lib/api-types';

export function useWorkspaces() {
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: () => apiFetch<WorkspacesResponse>('/workspaces'),
  });
}

export function useWorkspaceDetail(workspaceId: string) {
  return useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () =>
      apiFetch<WorkspaceDetailResponse>(`/workspaces/${workspaceId}`, {
        workspaceId,
      }),
    enabled: !!workspaceId,
  });
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateWorkspaceRequest) =>
      apiFetch<CreateWorkspaceResponse>('/workspaces', {
        method: 'POST',
        body,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
}

export function useUpdateWorkspace(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    // The API takes the workspace name at the top level and the profile
    // fields nested under product_profile; flat profile fields are ignored.
    mutationFn: ({ name, ...profile }: Partial<ProductProfile & { name: string }>) =>
      apiFetch<WorkspaceDetailResponse>(`/workspaces/${workspaceId}`, {
        method: 'PATCH',
        body: {
          ...(name !== undefined ? { name } : {}),
          ...(Object.keys(profile).length > 0 ? { product_profile: profile } : {}),
        },
        workspaceId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
}
