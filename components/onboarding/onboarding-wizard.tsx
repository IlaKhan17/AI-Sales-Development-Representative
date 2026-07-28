'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, ArrowRight, Check } from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { useCreateWorkspace } from '@/lib/hooks/use-workspaces';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ListInput } from '@/components/ui-extras/list-input';
import {
  companyStepSchema,
  positioningStepSchema,
  sendingStepSchema,
  knowledgeStepSchema,
  type CompanyStepValues,
  type PositioningStepValues,
  type SendingStepValues,
  type KnowledgeStepValues,
} from '@/components/onboarding/schemas';

const STEPS = [
  { title: 'Company', description: 'Tell us about your company and product' },
  { title: 'Positioning', description: 'How you talk about your product' },
  { title: 'Sending', description: 'Who sends and how much' },
  { title: 'Knowledge', description: 'Seed your knowledge base (optional)' },
] as const;

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((step, i) => (
        <div key={step.title} className="flex flex-1 items-center gap-2">
          <div
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-medium',
              i < current && 'border-primary bg-primary text-primary-foreground',
              i === current && 'border-primary text-primary',
              i > current && 'border-border text-muted-foreground'
            )}
          >
            {i < current ? <Check className="h-4 w-4" /> : i + 1}
          </div>
          <span
            className={cn(
              'hidden text-sm sm:block',
              i === current ? 'font-medium text-foreground' : 'text-muted-foreground'
            )}
          >
            {step.title}
          </span>
          {i < STEPS.length - 1 && <div className="h-px flex-1 bg-border" />}
        </div>
      ))}
    </div>
  );
}

export function OnboardingWizard() {
  const router = useRouter();
  const createWorkspace = useCreateWorkspace();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const companyForm = useForm<CompanyStepValues>({
    resolver: zodResolver(companyStepSchema),
    defaultValues: {
      name: '',
      company_name: '',
      product_description: '',
      website: '',
    },
  });

  const positioningForm = useForm<PositioningStepValues>({
    resolver: zodResolver(positioningStepSchema),
    defaultValues: {
      target_market: '',
      value_proposition: '',
      approved_stories: [],
      disallowed_claims: [],
      tone: 'professional',
    },
  });

  const sendingForm = useForm<SendingStepValues>({
    resolver: zodResolver(sendingStepSchema),
    defaultValues: {
      sender_name: '',
      sender_title: '',
      meeting_duration_minutes: 30,
      territory: '',
      daily_send_limit: 50,
    },
  });

  const knowledgeForm = useForm<KnowledgeStepValues>({
    resolver: zodResolver(knowledgeStepSchema),
    defaultValues: { ingest_url: '', doc_title: '', doc_content: '' },
  });

  const back = () => setStep((s) => Math.max(0, s - 1));
  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));

  async function submitAll(knowledge: KnowledgeStepValues) {
    setSubmitting(true);
    try {
      const body = {
        ...companyForm.getValues(),
        ...positioningForm.getValues(),
        ...sendingForm.getValues(),
      };
      const { workspace } = await createWorkspace.mutateAsync(body);

      // Fire optional knowledge ingestion; failures shouldn't block onboarding.
      const ingestions: Promise<unknown>[] = [];
      if (knowledge.ingest_url.trim()) {
        ingestions.push(
          apiFetch('/knowledge/ingest-website', {
            method: 'POST',
            body: { url: knowledge.ingest_url.trim() },
            workspaceId: workspace.id,
          })
        );
      }
      if (knowledge.doc_content.trim()) {
        ingestions.push(
          apiFetch('/knowledge/documents', {
            method: 'POST',
            body: {
              title: knowledge.doc_title.trim() || 'Onboarding notes',
              content: knowledge.doc_content,
            },
            workspaceId: workspace.id,
          })
        );
      }
      if (ingestions.length > 0) {
        const results = await Promise.allSettled(ingestions);
        const failed = results.filter((r) => r.status === 'rejected');
        if (failed.length > 0) {
          toast.warning(
            'Workspace created, but some knowledge ingestion failed. You can retry from Settings.'
          );
        }
      }

      toast.success(`Workspace "${workspace.name}" created`);
      router.push(`/w/${workspace.id}/dashboard`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to create workspace'
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 py-8">
      <StepIndicator current={step} />

      <Card>
        <CardHeader>
          <CardTitle>{STEPS[step].title}</CardTitle>
          <CardDescription>{STEPS[step].description}</CardDescription>
        </CardHeader>
        <CardContent>
          {step === 0 && (
            <Form {...companyForm}>
              <form
                onSubmit={companyForm.handleSubmit(() => next())}
                className="space-y-5"
              >
                <FormField
                  control={companyForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Workspace name</FormLabel>
                      <FormControl>
                        <Input placeholder="Acme Outbound" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={companyForm.control}
                  name="company_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company name</FormLabel>
                      <FormControl>
                        <Input placeholder="Acme Inc." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={companyForm.control}
                  name="product_description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Product description</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={4}
                          placeholder="What does your product do, and for whom?"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={companyForm.control}
                  name="website"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Website</FormLabel>
                      <FormControl>
                        <Input placeholder="https://acme.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end">
                  <Button type="submit">
                    Next <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </form>
            </Form>
          )}

          {step === 1 && (
            <Form {...positioningForm}>
              <form
                onSubmit={positioningForm.handleSubmit(() => next())}
                className="space-y-5"
              >
                <FormField
                  control={positioningForm.control}
                  name="target_market"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target market</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="B2B SaaS companies, 50-500 employees"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={positioningForm.control}
                  name="value_proposition"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Value proposition</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={3}
                          placeholder="Why do customers pick you?"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={positioningForm.control}
                  name="approved_stories"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Approved customer stories</FormLabel>
                      <FormControl>
                        <ListInput
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="e.g. Helped Globex cut onboarding time 40%"
                        />
                      </FormControl>
                      <FormDescription>
                        Only these stories may be referenced in outreach.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={positioningForm.control}
                  name="disallowed_claims"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Disallowed claims</FormLabel>
                      <FormControl>
                        <ListInput
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="e.g. 'guaranteed ROI'"
                        />
                      </FormControl>
                      <FormDescription>
                        Phrases the AI must never use.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={positioningForm.control}
                  name="tone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tone</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a tone" />
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
                <div className="flex justify-between">
                  <Button type="button" variant="outline" onClick={back}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                  <Button type="submit">
                    Next <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </form>
            </Form>
          )}

          {step === 2 && (
            <Form {...sendingForm}>
              <form
                onSubmit={sendingForm.handleSubmit(() => next())}
                className="space-y-5"
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField
                    control={sendingForm.control}
                    name="sender_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sender name</FormLabel>
                        <FormControl>
                          <Input placeholder="Jane Smith" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={sendingForm.control}
                    name="sender_title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sender title</FormLabel>
                        <FormControl>
                          <Input placeholder="Head of Growth" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={sendingForm.control}
                  name="territory"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Territory</FormLabel>
                      <FormControl>
                        <Input placeholder="North America" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField
                    control={sendingForm.control}
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
                    control={sendingForm.control}
                    name="daily_send_limit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Daily send limit</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} max={500} {...field} />
                        </FormControl>
                        <FormDescription>
                          Maximum emails sent per day from this workspace.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="flex justify-between">
                  <Button type="button" variant="outline" onClick={back}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                  <Button type="submit">
                    Next <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </form>
            </Form>
          )}

          {step === 3 && (
            <Form {...knowledgeForm}>
              <form
                onSubmit={knowledgeForm.handleSubmit(submitAll)}
                className="space-y-5"
              >
                <FormField
                  control={knowledgeForm.control}
                  name="ingest_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Website to ingest (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="https://acme.com" {...field} />
                      </FormControl>
                      <FormDescription>
                        We will crawl this site to extract approved product claims.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={knowledgeForm.control}
                  name="doc_title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Document title (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Sales one-pager" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={knowledgeForm.control}
                  name="doc_content"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Document content (optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={6}
                          placeholder="Paste product docs, FAQs, or positioning notes…"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={back}
                    disabled={submitting}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Create workspace
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
