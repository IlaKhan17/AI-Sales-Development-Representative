'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

import { useWorkspace } from '@/components/providers/workspace-provider';
import {
  useWorkspaceDetail,
  useUpdateWorkspace,
} from '@/lib/hooks/use-workspaces';
import { can } from '@/lib/roles';
import { Button } from '@/components/ui/button';
import { FormSection } from '@/components/page-header';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ListInput } from '@/components/ui-extras/list-input';
import { SettingsNav } from '@/components/settings/settings-nav';

const profileSchema = z.object({
  name: z.string().min(1, 'Required'),
  company_name: z.string().min(1, 'Required'),
  product_description: z.string().min(1, 'Required'),
  website: z.string().url('Enter a valid URL').or(z.literal('')),
  target_market: z.string(),
  value_proposition: z.string(),
  approved_stories: z.array(z.string()),
  disallowed_claims: z.array(z.string()),
  tone: z.string(),
  sender_name: z.string(),
  sender_title: z.string(),
  meeting_duration_minutes: z.coerce.number().int().min(15).max(120),
  territory: z.string(),
  daily_send_limit: z.coerce.number().int().min(1).max(500),
});

type ProfileValues = z.infer<typeof profileSchema>;

export default function WorkspaceSettingsPage() {
  const { workspace, role } = useWorkspace();
  const { data, isLoading, isError, error, refetch } = useWorkspaceDetail(
    workspace.id
  );
  const update = useUpdateWorkspace(workspace.id);
  const editable = can(role, 'edit_workspace');

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: workspace.name,
      company_name: '',
      product_description: '',
      website: '',
      target_market: '',
      value_proposition: '',
      approved_stories: [],
      disallowed_claims: [],
      tone: 'professional',
      sender_name: '',
      sender_title: '',
      meeting_duration_minutes: 30,
      territory: '',
      daily_send_limit: 50,
    },
  });

  useEffect(() => {
    if (!data) return;
    const p = data.product_profile;
    form.reset({
      name: data.workspace.name,
      company_name: p?.company_name ?? '',
      product_description: p?.product_description ?? '',
      website: p?.website ?? '',
      target_market: p?.target_market ?? '',
      value_proposition: p?.value_proposition ?? '',
      approved_stories: p?.approved_stories ?? [],
      disallowed_claims: p?.disallowed_claims ?? [],
      tone: p?.tone ?? 'professional',
      sender_name: p?.sender_name ?? '',
      sender_title: p?.sender_title ?? '',
      meeting_duration_minutes: p?.meeting_duration_minutes ?? 30,
      territory: p?.territory ?? '',
      daily_send_limit: p?.daily_send_limit ?? 50,
    });
  }, [data, form]);

  if (isLoading) {
    return (
      <div className="max-w-2xl space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-2xl space-y-4">
        <p className="text-sm text-destructive">
          Failed to load workspace: {error instanceof Error ? error.message : 'Unknown error'}
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync(values);
      toast.success('Workspace settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings');
    }
  });

  return (
    <div className="max-w-5xl space-y-8">
      <SettingsNav />
      <div>
        <h2 className="text-lg font-semibold">Company profile</h2>
        <p className="text-sm text-muted-foreground">
          {editable
            ? 'What Davis knows about your company and how it sends. Drafts are written from this.'
            : 'Read only. Ask a workspace owner or admin to make changes.'}
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-6">
          <fieldset disabled={!editable || update.isPending} className="space-y-6">
            <FormSection title="Company" description="What you sell and where to learn more about it.">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Workspace name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="company_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="product_description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Product description</FormLabel>
                      <FormControl>
                        <Textarea rows={4} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="website"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Website</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </FormSection>

            <FormSection title="Positioning" description="How drafts talk about your product. Only approved stories are used; disallowed claims block a draft.">
                <FormField
                  control={form.control}
                  name="target_market"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target market</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="value_proposition"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Value proposition</FormLabel>
                      <FormControl>
                        <Textarea rows={3} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="approved_stories"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Approved customer stories</FormLabel>
                      <FormControl>
                        <ListInput
                          value={field.value}
                          onChange={field.onChange}
                          disabled={!editable}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="disallowed_claims"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Disallowed claims</FormLabel>
                      <FormControl>
                        <ListInput
                          value={field.value}
                          onChange={field.onChange}
                          disabled={!editable}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tone</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="professional">Professional</SelectItem>
                          <SelectItem value="friendly">Friendly</SelectItem>
                          <SelectItem value="direct">Direct</SelectItem>
                          <SelectItem value="consultative">Consultative</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </FormSection>

            <FormSection title="Sending" description="Who emails come from and how many can go out in a day.">
                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="sender_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sender name</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="sender_title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sender title</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="territory"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Territory</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="meeting_duration_minutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Meeting duration (minutes)</FormLabel>
                        <FormControl>
                          <Input type="number" min={15} max={120} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="daily_send_limit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Daily send limit</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} max={500} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </FormSection>
          </fieldset>

          {editable && (
            <div className="flex justify-end">
              <Button type="submit" disabled={update.isPending}>
                {update.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Save changes
              </Button>
            </div>
          )}
        </form>
      </Form>
    </div>
  );
}
