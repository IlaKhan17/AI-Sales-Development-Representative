'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, ShieldCheck } from 'lucide-react';

import { useWorkspace } from '@/components/providers/workspace-provider';
import { useIcpProfiles } from '@/lib/hooks/use-icp';
import { useCreateCampaign } from '@/lib/hooks/use-campaigns';
import type { AllowedSource } from '@/lib/api-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const SOURCE_OPTIONS: Array<{ value: AllowedSource; label: string }> = [
  { value: 'google', label: 'Google' },
  { value: 'reddit', label: 'Reddit' },
  { value: 'product_hunt', label: 'Product Hunt' },
  { value: 'g2', label: 'G2' },
  { value: 'hacker_news', label: 'Hacker News' },
  { value: 'github', label: 'GitHub' },
  { value: 'crunchbase', label: 'Crunchbase' },
  { value: 'wellfound', label: 'Wellfound' },
  { value: 'yc_directory', label: 'YC Directory' },
];

const SOURCE_VALUES = SOURCE_OPTIONS.map((s) => s.value) as [
  AllowedSource,
  ...AllowedSource[],
];

const formSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(120),
  objective: z.string().max(2000).optional(),
  icp_version_id: z.string().min(1, 'Select an ICP version'),
  region: z.string().max(120).optional(),
  target_prospect_count: z.coerce
    .number()
    .int()
    .min(5, 'Minimum 5 prospects')
    .max(200, 'Maximum 200 prospects'),
  allowed_sources: z
    .array(z.enum(SOURCE_VALUES))
    .min(1, 'Select at least one source'),
  sequence_length: z.coerce.number().int().min(1).max(4),
  daily_cap: z.coerce.number().int().min(1).max(1000),
});

type FormValues = z.infer<typeof formSchema>;

export default function NewCampaignPage() {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const icpQuery = useIcpProfiles(workspace.id);
  const createCampaign = useCreateCampaign(workspace.id);

  // Group selectable versions by profile; only draft/active are usable.
  const versionGroups = useMemo(() => {
    const profiles = icpQuery.data?.profiles ?? [];
    return profiles
      .map((profile) => ({
        profile,
        versions: profile.versions
          .filter((v) => v.status === 'active' || v.status === 'draft')
          .sort((a, b) => b.version - a.version),
      }))
      .filter((g) => g.versions.length > 0);
  }, [icpQuery.data]);

  // Prefer an active version as the default selection.
  const defaultVersionId = useMemo(() => {
    for (const g of versionGroups) {
      const active = g.versions.find((v) => v.status === 'active');
      if (active) return active.id;
    }
    return versionGroups[0]?.versions[0]?.id ?? '';
  }, [versionGroups]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values: {
      name: '',
      objective: '',
      icp_version_id: defaultVersionId,
      region: '',
      target_prospect_count: 25,
      allowed_sources: ['google', 'reddit', 'hacker_news'],
      sequence_length: 2,
      daily_cap: 20,
    },
    resetOptions: { keepDirtyValues: true },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      const { campaign } = await createCampaign.mutateAsync({
        name: values.name,
        icp_version_id: values.icp_version_id,
        objective: values.objective?.trim() || undefined,
        region: values.region?.trim() || undefined,
        target_prospect_count: values.target_prospect_count,
        allowed_sources: values.allowed_sources,
        sequence_length: values.sequence_length,
        daily_cap: values.daily_cap,
        approval_policy: 'manual',
      });
      toast.success(`Campaign "${campaign.name}" created`);
      router.push(`/w/${workspace.id}/campaigns/${campaign.id}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to create campaign'
      );
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href={`/w/${workspace.id}/campaigns`}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Campaigns
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">New Campaign</h1>
        <p className="text-sm text-muted-foreground">
          Configure discovery scope, sources, and outreach limits.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Basics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Q3 fintech founders" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="objective"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Objective</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder="Book intro calls with heads of RevOps evaluating outbound tooling…"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Optional. Guides the research and messaging agents.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="icp_version_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ICP version</FormLabel>
                    {icpQuery.isLoading ? (
                      <Skeleton className="h-10 w-full" />
                    ) : icpQuery.isError ? (
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-destructive">
                          Failed to load ICP profiles.
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => icpQuery.refetch()}
                        >
                          Retry
                        </Button>
                      </div>
                    ) : versionGroups.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No draft or active ICP versions available.{' '}
                        <Link
                          href={`/w/${workspace.id}/icp`}
                          className="text-primary underline"
                        >
                          Create one first
                        </Link>
                        .
                      </p>
                    ) : (
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select an ICP version" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {versionGroups.map(({ profile, versions }) => (
                            <SelectGroup key={profile.id}>
                              <SelectLabel>{profile.name}</SelectLabel>
                              {versions.map((v) => (
                                <SelectItem key={v.id} value={v.id}>
                                  v{v.version} ·{' '}
                                  {v.status === 'active' ? 'Active' : 'Draft'}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="region"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Region</FormLabel>
                    <FormControl>
                      <Input placeholder="North America" {...field} />
                    </FormControl>
                    <FormDescription>Optional geographic focus.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Discovery</CardTitle>
              <CardDescription>
                How many prospects to find and where to look.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <FormField
                control={form.control}
                name="target_prospect_count"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target prospect count</FormLabel>
                    <FormControl>
                      <Input type="number" min={5} max={200} {...field} />
                    </FormControl>
                    <FormDescription>Between 5 and 200.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="allowed_sources"
                render={() => (
                  <FormItem>
                    <FormLabel>Allowed sources</FormLabel>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {SOURCE_OPTIONS.map((source) => (
                        <FormField
                          key={source.value}
                          control={form.control}
                          name="allowed_sources"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center space-x-2 space-y-0 rounded-md border p-3">
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(source.value)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      field.onChange([
                                        ...(field.value ?? []),
                                        source.value,
                                      ]);
                                    } else {
                                      field.onChange(
                                        (field.value ?? []).filter(
                                          (v) => v !== source.value
                                        )
                                      );
                                    }
                                  }}
                                />
                              </FormControl>
                              <FormLabel className="text-sm font-normal">
                                {source.label}
                              </FormLabel>
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Outreach</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="sequence_length"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sequence length</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} max={4} {...field} />
                      </FormControl>
                      <FormDescription>Emails per prospect (1–4).</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="daily_cap"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Daily cap</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} {...field} />
                      </FormControl>
                      <FormDescription>Max sends per day.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
                <span>
                  <span className="font-medium">Human approval required.</span>{' '}
                  All drafts must be manually approved before sending.
                </span>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button variant="outline" type="button" asChild>
              <Link href={`/w/${workspace.id}/campaigns`}>Cancel</Link>
            </Button>
            <Button type="submit" disabled={createCampaign.isPending}>
              {createCampaign.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Create Campaign
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
