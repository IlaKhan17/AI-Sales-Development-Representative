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
import { Card, CardContent } from '@/components/ui/card';
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
    <div className="max-w-2xl space-y-6">
      <SettingsNav />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Suppression list</h1>
          <p className="text-sm text-muted-foreground">
            Addresses that will never be emailed by this workspace.
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
        <Card className="border-destructive/30">
          <CardContent className="py-10 text-center">
            <p className="text-sm text-destructive">
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
          </CardContent>
        </Card>
      ) : !data || data.entries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <ShieldBan className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No suppressed addresses.
            </p>
          </CardContent>
        </Card>
      ) : (
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
      )}
    </div>
  );
}
