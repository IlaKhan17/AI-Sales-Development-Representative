'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Loader2, Plus, Target } from 'lucide-react';

import { useWorkspace } from '@/components/providers/workspace-provider';
import { RoleGate } from '@/components/role-gate';
import {
  useIcpProfiles,
  useCreateIcpProfile,
  useActivateIcpVersion,
} from '@/lib/hooks/use-icp';
import type { IcpVersionStatus } from '@/lib/api-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

function StatusBadge({ status }: { status: IcpVersionStatus }) {
  const tone =
    status === 'active'
      ? 'bg-approve/10 text-approve border-approve/30'
      : status === 'draft'
        ? 'bg-transparent text-foreground border-dashed border-border'
        : 'bg-transparent text-muted-foreground border-border';
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${tone}`}>
      {status}
    </span>
  );
}

export default function IcpPage() {
  const { workspace } = useWorkspace();
  const { data, isLoading, isError, error, refetch } = useIcpProfiles(
    workspace.id
  );
  const createProfile = useCreateIcpProfile(workspace.id);
  const activate = useActivateIcpVersion(workspace.id);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await createProfile.mutateAsync({ name });
      toast.success(`ICP profile "${name}" created`);
      setNewName('');
      setCreateOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create profile');
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Ideal customer"
        description="Who Davis looks for and how each prospect is scored. A saved version never changes; to edit, start a new draft."
        actions={
        <RoleGate action="edit_icp">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New profile
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New profile</DialogTitle>
                <DialogDescription>
                  Name the kind of customer, for example by segment. You add the details as a version next.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="icp-name">Name</Label>
                <Input
                  id="icp-name"
                  placeholder="Mid-market SaaS"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button
                  onClick={handleCreate}
                  disabled={createProfile.isPending || !newName.trim()}
                >
                  {createProfile.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create profile
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </RoleGate>
        }
      />

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : isError ? (
        <div className="space-y-3">
          <p className="text-sm text-hold">
            Couldn&apos;t load profiles: {error instanceof Error ? error.message : 'unknown error'}
          </p>
          <Button variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : !data || data.profiles.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-6 py-14 text-center">
          <Target className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No profiles yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            A profile describes one kind of customer. Campaigns score every prospect against it.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {data.profiles.map((profile) => (
            <section key={profile.id} className="rounded-md border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
                <div>
                  <h2 className="text-base font-semibold">{profile.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {profile.versions.length} version
                    {profile.versions.length === 1 ? '' : 's'}
                  </p>
                </div>
                <RoleGate action="edit_icp">
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      href={`/w/${workspace.id}/icp/${profile.id}/versions/new`}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      New version
                    </Link>
                  </Button>
                </RoleGate>
              </div>
              <div className="divide-y divide-border">
                {profile.versions.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-muted-foreground">
                    No versions yet. Add one to describe this customer.
                  </p>
                ) : (
                  [...profile.versions]
                    .sort((a, b) => b.version - a.version)
                    .map((v) => (
                      <div
                        key={v.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold">
                            Version {v.version}
                          </span>
                          <StatusBadge status={v.status} />
                          {v.created_at && (
                            <span className="text-xs text-muted-foreground">
                              Saved {new Date(v.created_at).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" asChild>
                            <Link
                              href={`/w/${workspace.id}/icp/${profile.id}/versions/${v.id}`}
                            >
                              {v.status === 'draft' ? 'Edit' : 'View'}
                            </Link>
                          </Button>
                          {v.status === 'draft' && (
                            <RoleGate action="edit_icp">
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={activate.isPending}
                                onClick={async () => {
                                  try {
                                    await activate.mutateAsync({
                                      profileId: profile.id,
                                      versionId: v.id,
                                    });
                                    toast.success(`Version ${v.version} activated`);
                                  } catch (err) {
                                    toast.error(
                                      err instanceof Error
                                        ? err.message
                                        : 'Failed to activate version'
                                    );
                                  }
                                }}
                              >
                                Activate
                              </Button>
                            </RoleGate>
                          )}
                        </div>
                      </div>
                    ))
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
