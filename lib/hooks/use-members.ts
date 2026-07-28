'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { MembersResponse } from '@/lib/api-types';
import type { Role } from '@/lib/roles';

export function useMembers(workspaceId: string) {
  return useQuery({
    queryKey: ['members', workspaceId],
    queryFn: () =>
      apiFetch<MembersResponse>(`/workspaces/${workspaceId}/members`, {
        workspaceId,
      }),
    enabled: !!workspaceId,
  });
}

export function useInviteMember(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; role: Role }) =>
      apiFetch<unknown>(`/workspaces/${workspaceId}/invites`, {
        method: 'POST',
        body,
        workspaceId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', workspaceId] });
    },
  });
}

export function useUpdateMemberRole(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      apiFetch<unknown>(`/workspaces/${workspaceId}/members/${userId}`, {
        method: 'PATCH',
        body: { role },
        workspaceId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', workspaceId] });
    },
  });
}

export function useRemoveMember(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiFetch<unknown>(`/workspaces/${workspaceId}/members/${userId}`, {
        method: 'DELETE',
        workspaceId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', workspaceId] });
    },
  });
}
