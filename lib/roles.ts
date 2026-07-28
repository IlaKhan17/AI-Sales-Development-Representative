export type Role = 'owner' | 'admin' | 'member' | 'reviewer';

export type Action =
  | 'approve_drafts'
  | 'edit_icp'
  | 'manage_members'
  | 'edit_workspace'
  | 'create_campaign';

const PERMISSIONS: Record<Action, Role[]> = {
  approve_drafts: ['owner', 'admin', 'reviewer'],
  edit_icp: ['owner', 'admin'],
  manage_members: ['owner', 'admin'],
  edit_workspace: ['owner', 'admin'],
  create_campaign: ['owner', 'admin', 'member'],
};

export function can(role: Role, action: Action): boolean {
  return PERMISSIONS[action].includes(role);
}
