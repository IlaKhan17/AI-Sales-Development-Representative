'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Loader2 } from 'lucide-react';

import { useWorkspace } from '@/components/providers/workspace-provider';
import { can } from '@/lib/roles';
import {
  useIcpProfiles,
  useCreateIcpVersion,
} from '@/lib/hooks/use-icp';
import type { IcpDefinition, IcpWeights } from '@/lib/api-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import { FormSection, PageHeader } from '@/components/page-header';
import { ListInput } from '@/components/ui-extras/list-input';
import { cn } from '@/lib/utils';

const EMPTY_DEFINITION: IcpDefinition = {
  target_roles: [],
  seniority: [],
  industries: [],
  company_size_min: 1,
  company_size_max: 1000,
  geography: [],
  funding_stages: [],
  technologies: [],
  positive_signals: [],
  pain_signals: [],
  exclusions: [],
};

const DEFAULT_WEIGHTS: IcpWeights = {
  role: 30,
  industry: 20,
  company_size: 15,
  geography: 10,
  buying_signals: 15,
  technology: 10,
};

const LIST_FIELDS: { key: keyof IcpDefinition; label: string; placeholder: string }[] = [
  { key: 'target_roles', label: 'Target roles', placeholder: 'e.g. VP Sales' },
  { key: 'seniority', label: 'Seniority', placeholder: 'e.g. Director+' },
  { key: 'industries', label: 'Industries', placeholder: 'e.g. Fintech' },
  { key: 'geography', label: 'Geography', placeholder: 'e.g. United States' },
  { key: 'funding_stages', label: 'Funding stages', placeholder: 'e.g. Series B' },
  { key: 'technologies', label: 'Technologies', placeholder: 'e.g. Salesforce' },
  { key: 'positive_signals', label: 'Positive signals', placeholder: 'e.g. Hiring SDRs' },
  { key: 'pain_signals', label: 'Pain signals', placeholder: 'e.g. Manual outreach complaints' },
  { key: 'exclusions', label: 'Exclusions (a match disqualifies)', placeholder: 'e.g. agency, consulting' },
];

const WEIGHT_FIELDS: { key: keyof IcpWeights; label: string }[] = [
  { key: 'role', label: 'Role match' },
  { key: 'industry', label: 'Industry' },
  { key: 'company_size', label: 'Company size' },
  { key: 'geography', label: 'Geography' },
  { key: 'buying_signals', label: 'Buying signals' },
  { key: 'technology', label: 'Technology' },
];

export default function IcpVersionEditorPage() {
  const params = useParams<{
    workspaceId: string;
    profileId: string;
    versionId: string;
  }>();
  const router = useRouter();
  const { workspace, role } = useWorkspace();
  const canEdit = can(role, 'edit_icp');

  const { data, isLoading, isError, error, refetch } = useIcpProfiles(
    workspace.id
  );
  const createVersion = useCreateIcpVersion(workspace.id);

  const isNew = params.versionId === 'new';
  const profile = data?.profiles.find((p) => p.id === params.profileId);
  const sourceVersion = isNew
    ? null
    : profile?.versions.find((v) => v.id === params.versionId) ?? null;

  const [definition, setDefinition] = useState<IcpDefinition>(EMPTY_DEFINITION);
  const [weights, setWeights] = useState<IcpWeights>(DEFAULT_WEIGHTS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated || !data) return;
    if (sourceVersion) {
      setDefinition({ ...EMPTY_DEFINITION, ...sourceVersion.definition });
      setWeights({ ...DEFAULT_WEIGHTS, ...sourceVersion.weights });
    }
    setHydrated(true);
  }, [data, sourceVersion, hydrated]);

  const total = useMemo(
    () => Object.values(weights).reduce((sum, w) => sum + w, 0),
    [weights]
  );

  // Drafts stay editable via save-as-new-version too (the contract has no
  // draft-edit endpoint); active/archived versions are immutable by design.
  const readOnly = !canEdit;
  const editingImmutable =
    sourceVersion !== null && sourceVersion.status !== 'draft';

  if (isLoading || !hydrated) {
    return (
      <div className="max-w-5xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-5xl space-y-3">
        <p className="text-sm text-hold">
          Couldn&apos;t load this profile: {error instanceof Error ? error.message : 'unknown error'}
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!profile || (!isNew && !sourceVersion)) {
    return (
      <div className="max-w-5xl space-y-3">
        <p className="text-sm text-muted-foreground">
          This profile or version doesn&apos;t exist in this workspace.
        </p>
        <Button variant="outline" asChild>
          <Link href={`/w/${workspace.id}/icp`}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Ideal customer
          </Link>
        </Button>
      </div>
    );
  }

  const save = async () => {
    if (total !== 100) return;
    if (definition.company_size_min > definition.company_size_max) {
      toast.error('Company size minimum cannot exceed maximum');
      return;
    }
    try {
      await createVersion.mutateAsync({
        profileId: profile.id,
        definition,
        weights,
      });
      toast.success('Saved as a new draft version');
      router.push(`/w/${workspace.id}/icp`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save version');
    }
  };

  const setList = (key: keyof IcpDefinition) => (next: string[]) =>
    setDefinition((d) => ({ ...d, [key]: next }));

  return (
    <div className="max-w-5xl space-y-8">
      <PageHeader
        back={{ href: `/w/${workspace.id}/icp`, label: 'Ideal customer' }}
        title={sourceVersion ? `${profile.name}, version ${sourceVersion.version}` : `${profile.name}, new draft`}
        status={
          sourceVersion ? (
            <span
              className={cn(
                'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize',
                sourceVersion.status === 'active'
                  ? 'border-approve/30 bg-approve/10 text-approve'
                  : 'border-dashed border-border text-muted-foreground'
              )}
            >
              {sourceVersion.status}
            </span>
          ) : undefined
        }
        description={
          !canEdit
            ? 'Read only. Only owners and admins can change the ideal customer.'
            : editingImmutable
              ? `Version ${sourceVersion?.version} is locked. Saving creates a new draft that starts from it.`
              : 'Describe who to look for and how much each part of the match counts.'
        }
      />

      <FormSection
        title="Who to look for"
        description="Each list is matched against facts found about a prospect. Write exclusions as single words that would appear in a fact, like agency rather than agencies."
      >
          {LIST_FIELDS.map(({ key, label, placeholder }) => (
            <div key={key} className="space-y-2">
              <Label>{label}</Label>
              <ListInput
                value={definition[key] as string[]}
                onChange={setList(key)}
                placeholder={placeholder}
                disabled={readOnly}
              />
            </div>
          ))}
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="size-min">Company size (min)</Label>
              <Input
                id="size-min"
                type="number"
                min={1}
                disabled={readOnly}
                value={definition.company_size_min}
                onChange={(e) =>
                  setDefinition((d) => ({
                    ...d,
                    company_size_min: Number(e.target.value) || 0,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="size-max">Company size (max)</Label>
              <Input
                id="size-max"
                type="number"
                min={1}
                disabled={readOnly}
                value={definition.company_size_max}
                onChange={(e) =>
                  setDefinition((d) => ({
                    ...d,
                    company_size_max: Number(e.target.value) || 0,
                  }))
                }
              />
            </div>
          </div>
      </FormSection>

      <FormSection
        title="How much each part counts"
        description="Split 100 points across the parts of a match. A prospect's score is the points it earns."
      >
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium">Points allocated</span>
            <span
              className={cn(
                'text-sm font-semibold',
                total === 100 ? 'text-approve' : 'text-hold'
              )}
            >
              {total} of 100
            </span>
          </div>
          <div className="flex h-2 w-full gap-px overflow-hidden rounded-sm bg-muted" aria-hidden>
            {WEIGHT_FIELDS.map(({ key }, i) =>
              weights[key] > 0 ? (
                <div
                  key={key}
                  className={i % 2 === 0 ? 'bg-foreground/80' : 'bg-foreground/45'}
                  style={{ width: `${Math.min(weights[key], 100)}%` }}
                />
              ) : null
            )}
          </div>
        </div>
          {WEIGHT_FIELDS.map(({ key, label }) => (
            <div key={key} className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{label}</Label>
                <span className="text-sm font-semibold">{weights[key]}</span>
              </div>
              <Slider
                value={[weights[key]]}
                min={0}
                max={100}
                step={5}
                disabled={readOnly}
                onValueChange={([v]) =>
                  setWeights((w) => ({ ...w, [key]: v }))
                }
              />
            </div>
          ))}
      </FormSection>

      {canEdit && (
        <div className="flex items-center justify-end gap-3">
          {total !== 100 && (
            <p className="text-sm text-hold">
              The points must add up to exactly 100 before you can save.
            </p>
          )}
          <Button
            onClick={save}
            disabled={total !== 100 || createVersion.isPending}
          >
            {createVersion.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Save as new draft
          </Button>
        </div>
      )}
    </div>
  );
}
