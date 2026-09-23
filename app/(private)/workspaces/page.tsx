'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, Plus, Loader2 } from 'lucide-react';
import { useWorkspaces } from '@/lib/hooks/use-workspaces';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

export default function WorkspacesPage() {
  const router = useRouter();
  const { data, isLoading, isError, error, refetch } = useWorkspaces();

  const workspaces = data?.workspaces;

  useEffect(() => {
    if (!workspaces) return;
    if (workspaces.length === 0) router.replace('/onboarding');
    else if (workspaces.length === 1)
      router.replace(`/w/${workspaces[0].id}/dashboard`);
  }, [workspaces, router]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-12">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-12 text-center">
        <p className="text-sm text-destructive">
          Failed to load workspaces: {error instanceof Error ? error.message : 'Unknown error'}
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!workspaces || workspaces.length <= 1) {
    // Redirecting (zero → onboarding, one → dashboard).
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Workspaces</h1>
        <Button asChild>
          <Link href="/onboarding">
            <Plus className="mr-2 h-4 w-4" />
            Create workspace
          </Link>
        </Button>
      </div>
      <div className="grid gap-4">
        {workspaces.map((ws) => (
          <Link key={ws.id} href={`/w/${ws.id}/dashboard`}>
            <Card className="transition-colors hover:border-border">
              <CardHeader className="flex flex-row items-center gap-4 space-y-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-base">{ws.name}</CardTitle>
                  <CardDescription>Open dashboard</CardDescription>
                </div>
                <Badge variant="outline" className="capitalize">
                  {ws.role}
                </Badge>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
