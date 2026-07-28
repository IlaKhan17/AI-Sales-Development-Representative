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
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  const variant =
    status === 'active' ? 'default' : status === 'draft' ? 'secondary' : 'outline';
  return (
    <Badge variant={variant} className="capitalize">
      {status}
    </Badge>
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
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Ideal Customer Profiles
          </h1>
          <p className="text-sm text-muted-foreground">
            Versioned definitions used for evidence-grounded scoring.
          </p>
        </div>
        <RoleGate action="edit_icp">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create profile
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New ICP profile</DialogTitle>
                <DialogDescription>
                  Name the profile; you can then add versioned definitions.
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
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </RoleGate>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : isError ? (
        <div className="space-y-3">
          <p className="text-sm text-destructive">
            Failed to load ICP profiles: {error instanceof Error ? error.message : 'Unknown error'}
          </p>
          <Button variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : !data || data.profiles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Target className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No ICP profiles yet. Create one to define who Davis should target.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {data.profiles.map((profile) => (
            <Card key={profile.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">{profile.name}</CardTitle>
                  <CardDescription>
                    {profile.versions.length} version
                    {profile.versions.length === 1 ? '' : 's'}
                  </CardDescription>
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
              </CardHeader>
              <CardContent className="space-y-2">
                {profile.versions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No versions yet.
                  </p>
                ) : (
                  [...profile.versions]
                    .sort((a, b) => b.version - a.version)
                    .map((v) => (
                      <div
                        key={v.id}
                        className="flex items-center justify-between rounded-md border px-3 py-2"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium">
                            v{v.version}
                          </span>
                          <StatusBadge status={v.status} />
                          {v.created_at && (
                            <span className="text-xs text-muted-foreground">
                              {new Date(v.created_at).toLocaleDateString()}
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
                                    toast.success(`v${v.version} activated`);
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
