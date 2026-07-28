'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { BusinessOutcomesResponse, EvalRunsResponse } from '@/lib/api-types';

export function useBusinessOutcomes(workspaceId: string) {
  return useQuery({
    queryKey: ['business-outcomes', workspaceId],
    queryFn: () => apiFetch<BusinessOutcomesResponse>('/evals/outcomes', { workspaceId }),
    enabled: !!workspaceId,
  });
}

export function useEvalRuns(workspaceId: string) {
  return useQuery({
    queryKey: ['eval-runs'],
    queryFn: () => apiFetch<EvalRunsResponse>('/evals/runs', { workspaceId }),
    enabled: !!workspaceId,
  });
}
