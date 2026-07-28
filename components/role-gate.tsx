'use client';

import { useWorkspace } from '@/components/providers/workspace-provider';
import { can, type Action } from '@/lib/roles';

/**
 * Renders children only when the current workspace role permits the action.
 * Optionally renders a fallback otherwise.
 */
export function RoleGate({
  action,
  children,
  fallback = null,
}: {
  action: Action;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { role } = useWorkspace();
  if (!can(role, action)) return <>{fallback}</>;
  return <>{children}</>;
}
