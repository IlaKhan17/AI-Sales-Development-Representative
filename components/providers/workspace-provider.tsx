'use client';

import { createContext, useContext, useMemo } from 'react';
import type { Role } from '@/lib/roles';

export interface Workspace {
  id: string;
  name: string;
}

interface WorkspaceContextValue {
  workspace: Workspace;
  role: Role;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  workspace,
  role,
  children,
}: {
  workspace: Workspace;
  role: Role;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ workspace, role }), [workspace, role]);
  return (
    <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return ctx;
}

/**
 * Like useWorkspace, but returns null outside a WorkspaceProvider.
 * Useful for components rendered on both legacy (/dashboard) and
 * workspace-scoped (/w/[workspaceId]/dashboard) routes.
 */
export function useWorkspaceOptional(): WorkspaceContextValue | null {
  return useContext(WorkspaceContext);
}
