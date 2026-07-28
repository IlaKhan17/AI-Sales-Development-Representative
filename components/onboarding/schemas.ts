import { z } from 'zod';

export const companyStepSchema = z.object({
  name: z.string().min(1, 'Workspace name is required'),
  company_name: z.string().min(1, 'Company name is required'),
  product_description: z
    .string()
    .min(10, 'Describe your product in at least 10 characters'),
  website: z
    .string()
    .url('Enter a valid URL (including https://)')
    .or(z.literal('')),
});

export const positioningStepSchema = z.object({
  target_market: z.string().min(1, 'Target market is required'),
  value_proposition: z.string().min(1, 'Value proposition is required'),
  approved_stories: z.array(z.string()),
  disallowed_claims: z.array(z.string()),
  tone: z.enum(['professional', 'friendly', 'direct', 'consultative']),
});

export const sendingStepSchema = z.object({
  sender_name: z.string().min(1, 'Sender name is required'),
  sender_title: z.string().min(1, 'Sender title is required'),
  meeting_duration_minutes: z.coerce
    .number()
    .int()
    .min(15, 'Minimum 15 minutes')
    .max(120, 'Maximum 120 minutes'),
  territory: z.string().min(1, 'Territory is required'),
  daily_send_limit: z.coerce
    .number()
    .int()
    .min(1, 'At least 1')
    .max(500, 'At most 500'),
});

export const knowledgeStepSchema = z.object({
  ingest_url: z
    .string()
    .url('Enter a valid URL (including https://)')
    .or(z.literal('')),
  doc_title: z.string(),
  doc_content: z.string(),
});

export type CompanyStepValues = z.infer<typeof companyStepSchema>;
export type PositioningStepValues = z.infer<typeof positioningStepSchema>;
export type SendingStepValues = z.infer<typeof sendingStepSchema>;
export type KnowledgeStepValues = z.infer<typeof knowledgeStepSchema>;

export type OnboardingValues = CompanyStepValues &
  PositioningStepValues &
  SendingStepValues;
