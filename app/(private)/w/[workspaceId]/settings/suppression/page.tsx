'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Loader2, Plus, RefreshCw, ShieldBan, Trash2 } from 'lucide-react';

import { useWorkspace } from '@/components/providers/workspace-provider';
import {
  useAddSuppression,
  useRemoveSuppression,
  useSuppression,
} from '@/lib/hooks/use-suppression';
import { SettingsNav } from '@/components/settings/settings-nav';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function SuppressionPage() {
  const { workspace } = useWorkspace();
  const { data, isLoading, isError, error, refetch } = useSuppression(
    workspace.id
  );
  const add = useAddSuppression(workspace.id);
  const remove = useRemoveSuppression(workspace.id);

  const [addOpen, setAddOpen] = useState(false);
  const [email, setEmail] = useState('');

  const handleAdd = async () => {
    const value = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      toast.error('Enter a valid email address');
      return;
    }
    try {
      await add.mutateAsync({ email: value, reason: 'manual' });
      toast.success(`${value} added to suppression list`);
      setAddOpen(false);
      setEmail('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add entry');
    }
  };

  const handleRemove = async (id: string, entryEmail: string) => {
    try {
      await remove.mutateAsync(id);
      toast.success(`${entryEmail} removed from suppression list`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove entry');
    }
  };

  return (
    <div className="max-w-4xl space-y-8">
      <SettingsNav />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Do not email</h2>
          <p className="text-sm text-muted-foreground">
            Addresses this workspace will never send to. Checked again at the moment of every send.
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1.5 h-4 w-4" /> Add entry
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Suppress an address</DialogTitle>
              <DialogDescription>
                This address will be blocked from all future sends.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="suppress-email">Email address</Label>
              <Input
                id="suppress-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="someone@example.com"
              />
            </div>
            <DialogFooter>
              <Button
                onClick={handleAdd}
                disabled={!email.trim() || add.isPending}
              >
                {add.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Add
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : isError ? (
        <div className="rounded-md border border-hold/30 bg-hold/10 py-10 text-center">
          <div>
            <p className="text-sm text-hold">
              {error instanceof Error
                ? error.message
                : 'Failed to load suppression list'}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => refetch()}
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" /> Retry
            </Button>
          </div>
        </div>
      ) : !data || data.entries.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-6 py-14 text-center">
          <ShieldBan className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Nobody on the list yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Anyone who replies asking to unsubscribe is added automatically. Add an address by hand
            to make sure it is never emailed.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="text-sm">{entry.email}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{entry.reason}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {entry.created_at
                    ? format(new Date(entry.created_at), 'MMM d, yyyy')
                    : '—'}
                </TableCell>
                <TableCell>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        disabled={remove.isPending}
                        aria-label={`Remove ${entry.email}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Remove {entry.email}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          This address will become eligible for outreach again.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleRemove(entry.id, entry.email)}
                        >
                          Remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
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
