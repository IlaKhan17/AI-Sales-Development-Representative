'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { RunResponse } from '@/lib/api-types';

/** Poll a run every 3s while it is pending/running. */
export function useRun(workspaceId: string, runId: string | null | undefined) {
  return useQuery({
    queryKey: ['run', workspaceId, runId],
    queryFn: () => apiFetch<RunResponse>(`/runs/${runId}`, { workspaceId }),
    enabled: !!workspaceId && !!runId,
    refetchInterval: (query) => {
      const status = query.state.data?.run.status;
      return status === 'running' || status === 'pending' ? 3000 : false;
    },
  });
}
