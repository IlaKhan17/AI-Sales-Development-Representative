'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type {
  ClaimReviewStatus,
  ClaimsResponse,
  KnowledgeDocumentsResponse,
} from '@/lib/api-types';

export function useKnowledgeDocuments(workspaceId: string) {
  return useQuery({
    queryKey: ['knowledge-documents', workspaceId],
    queryFn: () =>
      apiFetch<KnowledgeDocumentsResponse>('/knowledge/documents', {
        workspaceId,
      }),
    enabled: !!workspaceId,
  });
}

export function useIngestWebsite(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { url: string }) =>
      apiFetch<unknown>('/knowledge/ingest-website', {
        method: 'POST',
        body,
        workspaceId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['knowledge-documents', workspaceId],
      });
    },
  });
}

export function useCreateDocument(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; content: string }) =>
      apiFetch<unknown>('/knowledge/documents', {
        method: 'POST',
        body,
        workspaceId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['knowledge-documents', workspaceId],
      });
    },
  });
}

export function useDeleteDocument(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) =>
      apiFetch<unknown>(`/knowledge/documents/${documentId}`, {
        method: 'DELETE',
        workspaceId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['knowledge-documents', workspaceId],
      });
    },
  });
}

export function useClaims(workspaceId: string) {
  return useQuery({
    queryKey: ['claims', workspaceId],
    queryFn: () => apiFetch<ClaimsResponse>('/knowledge/claims', { workspaceId }),
    enabled: !!workspaceId,
  });
}

export function useReviewClaim(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      claimId,
      review_status,
    }: {
      claimId: string;
      review_status: ClaimReviewStatus;
    }) =>
      apiFetch<unknown>(`/knowledge/claims/${claimId}`, {
        method: 'PATCH',
        body: { review_status },
        workspaceId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claims', workspaceId] });
    },
  });
}
