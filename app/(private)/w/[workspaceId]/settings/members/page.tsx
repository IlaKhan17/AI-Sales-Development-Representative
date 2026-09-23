'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Trash2, UserPlus } from 'lucide-react';

import { useWorkspace } from '@/components/providers/workspace-provider';
import { SettingsNav } from '@/components/settings/settings-nav';
import { RoleGate } from '@/components/role-gate';
import type { Role } from '@/lib/roles';
import {
  useMembers,
  useInviteMember,
  useUpdateMemberRole,
  useRemoveMember,
} from '@/lib/hooks/use-members';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ROLES: Role[] = ['owner', 'admin', 'member', 'reviewer'];

export default function MembersPage() {
  const { workspace } = useWorkspace();
  const { data, isLoading, isError, error, refetch } = useMembers(workspace.id);
  const invite = useInviteMember(workspace.id);
  const updateRole = useUpdateMemberRole(workspace.id);
  const removeMember = useRemoveMember(workspace.id);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('member');

  const sendInvite = async () => {
    const email = inviteEmail.trim();
    if (!email || !email.includes('@')) {
      toast.error('Enter a valid email address');
      return;
    }
    try {
      await invite.mutateAsync({ email, role: inviteRole });
      toast.success(`Invite sent to ${email}`);
      setInviteEmail('');
      setInviteOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send invite');
    }
  };

  return (
    <div className="max-w-4xl space-y-8">
      <SettingsNav />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Members</h2>
          <p className="text-sm text-muted-foreground">
            People with access to this workspace.
          </p>
        </div>
        <RoleGate action="manage_members">
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="mr-2 h-4 w-4" />
                Invite
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite a teammate</DialogTitle>
                <DialogDescription>
                  They will get access to this workspace with the chosen role.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="invite-email">Email</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    placeholder="teammate@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select
                    value={inviteRole}
                    onValueChange={(v) => setInviteRole(v as Role)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.filter((r) => r !== 'owner').map((r) => (
                        <SelectItem key={r} value={r} className="capitalize">
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={sendInvite} disabled={invite.isPending}>
                  {invite.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Send invite
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </RoleGate>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : isError ? (
        <div className="space-y-3">
          <p className="text-sm text-destructive">
            Failed to load members: {error instanceof Error ? error.message : 'Unknown error'}
          </p>
          <Button variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : !data || data.members.length === 0 ? (
        <p className="text-sm text-muted-foreground">No members yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.members.map((m) => (
              <TableRow key={m.user_id}>
                <TableCell className="font-medium">{m.email}</TableCell>
                <TableCell>
                  <RoleGate
                    action="manage_members"
                    fallback={
                      <Badge variant="outline" className="capitalize">
                        {m.role}
                      </Badge>
                    }
                  >
                    <Select
                      value={m.role}
                      onValueChange={async (v) => {
                        try {
                          await updateRole.mutateAsync({
                            userId: m.user_id,
                            role: v as Role,
                          });
                          toast.success('Role updated');
                        } catch (err) {
                          toast.error(
                            err instanceof Error ? err.message : 'Failed to update role'
                          );
                        }
                      }}
                    >
                      <SelectTrigger className="w-32 capitalize">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r} value={r} className="capitalize">
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </RoleGate>
                </TableCell>
                <TableCell className="text-right">
                  <RoleGate action="manage_members">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${m.email}`}
                      onClick={async () => {
                        try {
                          await removeMember.mutateAsync(m.user_id);
                          toast.success(`Removed ${m.email}`);
                        } catch (err) {
                          toast.error(
                            err instanceof Error ? err.message : 'Failed to remove member'
                          );
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </RoleGate>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      )}
    </div>
  );
}
