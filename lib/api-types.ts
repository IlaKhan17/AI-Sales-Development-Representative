/**
 * TypeScript interfaces for the current backend payloads.
 * Shapes derived from the existing component usage (ProspectList, ProspectModal,
 * EmailDrafts, MeetingNotes, MeetingSearch, FollowUps, CalendarEvents,
 * GoogleConnectButton).
 */

export type EmailConfidence =
  | 'verified'
  | 'likely'
  | 'unverifiable'
  | 'invalid'
  | 'unknown';

export interface EmailCandidate {
  address: string;
  pattern: string;
  pattern_rank: number;
  confidence: EmailConfidence;
  smtp_code?: number;
  note?: string;
}

export interface ICPScoreBreakdown {
  role_match: number;
  industry_match: number;
  company_fit: number;
  pain_point_signals: number;
}

export interface Prospect {
  author: string;
  name?: string;
  role: string;
  company: string;
  isProspect: boolean;
  alignment_score: number;
  industry: string;
  pain_points: string[];
  solution_fit: string;
  insights: string;
  // Lead quality & reasoning
  selection_reasoning?: string;
  icp_score_breakdown?: ICPScoreBreakdown;
  disqualification_signals?: string[];
  // Contact discovery
  email?: string;
  email_confidence?: Exclude<EmailConfidence, 'invalid'>;
  email_candidates?: EmailCandidate[];
  source?: string;
  url?: string;
}

export interface DiscoveryJob {
  /** The search_query acting as ID */
  id: string;
  name: string;
  date: string;
  prospect_count: number;
  companies: string[];
}

export interface DiscoveryJobProspectsResponse {
  prospects: Prospect[];
}

export interface ICPPreferences {
  target_industries: string[];
  company_size: string;
  funding_stage: string;
  deal_breakers: string[];
  pain_points_to_target: string[];
}

export interface DiscoverProspectsRequest {
  company_description: string;
  goal: string;
  job_titles: string[];
  enable_playwright: boolean;
  enable_email_discovery: boolean;
  keyword_hint: string;
  icp: ICPPreferences | null;
}

export interface AutofillResponse {
  company_description?: string;
  goal?: string;
  job_titles?: string[];
  icp?: Partial<ICPPreferences>;
}

export interface EmailDraft {
  subject: string;
  content: string;
}

export interface DraftEmailResponse {
  email: EmailDraft;
}

export interface SendEmailRequest {
  to: string | undefined;
  subject: string | undefined;
  body: string | undefined;
}

export interface Meeting {
  id: string;
  bot_id: string;
  meeting_url: string;
  status?: 'active' | 'completed';
  date?: string;
  title?: string;
  duration?: string;
  description?: string;
  participants?: string[];
  transcript?: string;
  ai_summary?: string;
  action_items?: string | string[];
  insights?: string | string[];
}

export interface AddBotResponse {
  meeting: {
    id: string;
    botId: string;
  };
}

export interface MeetingsResponse {
  meetings: Meeting[];
}

export interface MeetingSource {
  meeting_id: string;
  title: string;
  date: string;
  score: number;
}

export interface KnowledgeBaseSearchResult {
  status: string;
  response: string;
  sources: MeetingSource[];
}

export interface CalendarEvent {
  id: string;
  summary: string;
  description: string;
  start: string;
  end: string;
  location: string;
  htmlLink: string;
  attendees: { email: string; status: string }[];
  meetLink?: string;
}

export interface CalendarEventsResponse {
  events: CalendarEvent[];
}

export interface CreateCalendarEventRequest {
  summary: string;
  start_time: string;
  end_time: string;
  description: string;
  location: string;
  attendees: string[];
}

export interface ReplyAnalysis {
  email: {
    from: string;
    subject: string;
    body: string;
  };
  analysis: {
    sentiment: string;
    intent: string;
  };
  suggested_followup?: {
    recipient: string;
    subject: string;
    body: string;
    status: string;
  };
}

export interface RepliesResponse {
  message: string;
  analyzed_emails: ReplyAnalysis[];
}

export interface GoogleStatus {
  connected: boolean;
  email?: string;
  scopes?: string[];
  last_refreshed?: string;
}

export interface GoogleAuthUrlResponse {
  auth_url: string;
}

// ---------------------------------------------------------------------------
// Davis 2.0 — workspace / knowledge / ICP contract types (Phase 2)
// ---------------------------------------------------------------------------

import type { Role } from '@/lib/roles';

export interface Workspace {
  id: string;
  name: string;
  role: Role;
}

export interface ProductProfile {
  company_name: string;
  product_description: string;
  website: string;
  target_market: string;
  value_proposition: string;
  approved_stories: string[];
  disallowed_claims: string[];
  tone: string;
  sender_name: string;
  sender_title: string;
  meeting_duration_minutes: number;
  territory: string;
  daily_send_limit: number;
}

export interface WorkspacesResponse {
  workspaces: Workspace[];
}

export interface CreateWorkspaceRequest extends ProductProfile {
  name: string;
}

export interface CreateWorkspaceResponse {
  workspace: Workspace;
  organization?: { id: string; name: string };
  membership?: { role: Role };
  product_profile?: ProductProfile | null;
}

export interface WorkspaceDetailResponse {
  workspace: { id: string; name: string };
  product_profile: ProductProfile | null;
  role: Role;
}

export interface Member {
  user_id: string;
  email: string;
  role: Role;
}

export interface MembersResponse {
  members: Member[];
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  content?: string;
  source_url?: string;
  created_at?: string;
}

export interface KnowledgeDocumentsResponse {
  documents: KnowledgeDocument[];
}

export type ClaimReviewStatus = 'pending' | 'approved' | 'rejected';

export interface ApprovedClaim {
  id: string;
  claim: string;
  source_url?: string;
  source_title?: string;
  evidence_snippet?: string;
  confidence?: number;
  review_status: ClaimReviewStatus;
  created_at?: string;
}

export interface ClaimsResponse {
  claims: ApprovedClaim[];
}

export interface IcpDefinition {
  target_roles: string[];
  seniority: string[];
  industries: string[];
  company_size_min: number;
  company_size_max: number;
  geography: string[];
  funding_stages: string[];
  technologies: string[];
  positive_signals: string[];
  pain_signals: string[];
  exclusions: string[];
}

export interface IcpWeights {
  role: number;
  industry: number;
  company_size: number;
  geography: number;
  buying_signals: number;
  technology: number;
}

export type IcpVersionStatus = 'draft' | 'active' | 'archived';

export interface IcpVersion {
  id: string;
  version: number;
  status: IcpVersionStatus;
  definition: IcpDefinition;
  weights: IcpWeights;
  created_at: string;
}

export interface IcpProfile {
  id: string;
  name: string;
  versions: IcpVersion[];
}

export interface IcpProfilesResponse {
  profiles: IcpProfile[];
}

// ---------------------------------------------------------------------------
// Davis 2.0 — campaigns / runs / prospects v2 (Phase 4)
// ---------------------------------------------------------------------------

export type CampaignStatus =
  | 'draft'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed';

export type ProspectV2Status =
  | 'discovered'
  | 'researching'
  | 'scored'
  | 'qualified'
  | 'needs_review'
  | 'insufficient_evidence'
  | 'disqualified';

export interface CampaignCounts {
  discovered: number;
  researching: number;
  scored: number;
  qualified: number;
  needs_review: number;
  insufficient_evidence: number;
  disqualified: number;
}

export type AllowedSource =
  | 'google'
  | 'reddit'
  | 'product_hunt'
  | 'g2'
  | 'hacker_news'
  | 'github'
  | 'crunchbase'
  | 'wellfound'
  | 'yc_directory';

export interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  icp_version_id: string;
  objective?: string | null;
  region?: string | null;
  target_prospect_count: number;
  allowed_sources: AllowedSource[];
  sequence_length?: number | null;
  daily_cap?: number | null;
  approval_policy?: string;
  created_at: string;
  counts?: CampaignCounts;
}

export interface CreateCampaignRequest {
  name: string;
  icp_version_id: string;
  objective?: string;
  region?: string;
  target_prospect_count: number;
  allowed_sources: AllowedSource[];
  sequence_length?: number;
  daily_cap?: number;
  approval_policy?: 'manual';
}

export interface CampaignsResponse {
  campaigns: Campaign[];
}

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'paused';

export interface AgentRun {
  id: string;
  status: RunStatus;
  graph_name?: string;
  started_at?: string | null;
  finished_at?: string | null;
  error?: string | null;
}

export interface RunStep {
  node: string;
  status: string;
  latency_ms?: number | null;
  created_at?: string;
}

export interface RunResponse {
  run: AgentRun;
  steps: RunStep[];
}

export interface CampaignDetailResponse {
  campaign: Campaign;
  counts: CampaignCounts;
  latest_run: AgentRun | null;
}

export interface ProspectV2 {
  id: string;
  full_name: string;
  role_title?: string | null;
  company: { name: string; domain?: string | null } | null;
  status: ProspectV2Status;
  email?: string | null;
  email_confidence?: string | null;
  score_total?: number | null;
  source?: string | null;
  created_at?: string;
}

export interface ProspectsV2Response {
  prospects: ProspectV2[];
}

export interface EvidenceClaim {
  id: string;
  claim: string;
  source_url?: string | null;
  source_title?: string | null;
  evidence_snippet?: string | null;
  observed_at?: string | null;
  confidence?: number | null;
}

export interface ProspectSignal {
  signal_type: string;
  // The backend stores {value, type}; older rows may hold a bare string.
  value?: string | { value?: unknown; type?: string | null } | null;
  confidence?: number | null;
  evidence_ids?: string[];
}

export interface ScoreComponent {
  points: number;
  max: number;
  reason?: string | null;
}

export interface ProspectScore {
  total: number;
  status: string;
  component_scores: Partial<
    Record<
      | 'role'
      | 'industry'
      | 'company_size'
      | 'geography'
      | 'buying_signals'
      | 'technology',
      ScoreComponent
    >
  >;
  disqualification_reason?: string | null;
}

export interface ProspectDossier {
  prospect: ProspectV2;
  company?: { name: string; domain?: string | null } | null;
  evidence: EvidenceClaim[];
  signals: ProspectSignal[];
  score: ProspectScore | null;
}

// ---------------------------------------------------------------------------
// Davis 2.0 — approvals / sequences / replies / suppression (Phase 5)
// ---------------------------------------------------------------------------

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface CheckFailure {
  code: string;
  detail: string;
}

export interface ApprovalPayload {
  to: string;
  subject: string;
  body: string;
  checks_failed?: CheckFailure[];
}

export interface ApprovalMessage {
  id: string;
  to_email: string;
  subject: string;
  body: string;
  status: string;
  step_number: number;
  prospect: {
    id: string;
    full_name: string;
    company_name: string;
  } | null;
}

export interface Approval {
  id: string;
  status: ApprovalStatus;
  subject_type: 'message';
  subject_id: string;
  created_at: string;
  requested_by?: string | null;
  payload: ApprovalPayload;
  message: ApprovalMessage | null;
}

export interface ApprovalsResponse {
  approvals: Approval[];
}

export interface ApprovalCountsResponse {
  pending: number;
}

export interface SendResult {
  status: 'sent' | 'failed' | 'blocked';
  error?: string;
  violations?: CheckFailure[];
}

export interface DecideApprovalRequest {
  decision: 'approve' | 'reject';
  edited_subject?: string;
  edited_body?: string;
}

export interface DecideApprovalResponse {
  approval: Approval;
  message: ApprovalMessage | null;
  send_result?: SendResult;
}

export interface SequenceStep {
  step_number: number;
  objective: string;
  delay_days: number;
}

export interface Sequence {
  id: string;
  name: string;
  status: string;
  campaign_id: string;
  steps: SequenceStep[];
}

export interface SequencesResponse {
  sequences: Sequence[];
}

export interface CreateSequenceRequest {
  campaign_id: string;
  name: string;
  steps: SequenceStep[];
}

export interface EnrollResponse {
  enrolled: number;
  drafts_created: number;
}

export type EnrollmentStatus =
  | 'active'
  | 'paused'
  | 'completed'
  | 'stopped_reply'
  | 'stopped_unsubscribe'
  | 'stopped_bounce';

export interface Enrollment {
  id: string;
  prospect: {
    id: string;
    full_name: string;
    company_name: string;
  } | null;
  status: EnrollmentStatus;
  current_step: number;
  next_send_at?: string | null;
}

export interface EnrollmentsResponse {
  enrollments: Enrollment[];
}

export type ReplyIntent =
  | 'interested'
  | 'meeting_requested'
  | 'needs_information'
  | 'objection'
  | 'referral'
  | 'not_now'
  | 'not_interested'
  | 'unsubscribe'
  | 'out_of_office'
  | 'wrong_person'
  | 'automatic'
  | 'ambiguous';

export interface Reply {
  id: string;
  from_email: string;
  subject: string;
  body: string;
  intent: ReplyIntent;
  intent_confidence: number;
  requires_human_review: boolean;
  recommended_action?: string | null;
  created_at: string;
  prospect_id?: string | null;
}

export interface RepliesV2Response {
  replies: Reply[];
}

export interface ReplyActionResponse {
  approval_id: string;
}

export interface SuppressionEntry {
  id: string;
  email: string;
  reason: string;
  created_at: string;
}

export interface SuppressionResponse {
  entries: SuppressionEntry[];
}

// ── Meetings v2 & calendar ──────────────────────────────────────────────

export type MeetingV2Status = 'active' | 'completed' | 'failed';

export interface MeetingV2 {
  id: string;
  prospect_id?: string | null;
  campaign_id?: string | null;
  bot_id?: string | null;
  meeting_url: string;
  title: string;
  status: MeetingV2Status;
  scheduled_at?: string | null;
  duration_minutes?: number | null;
  created_at: string;
  has_insights?: boolean;
}

export interface MeetingObjection {
  text: string;
  speaker?: string | null;
}

export interface MeetingCompetitor {
  name: string;
  context: string;
}

export interface MeetingInsights {
  id: string;
  meeting_id: string;
  summary: string;
  objections: MeetingObjection[];
  competitors: MeetingCompetitor[];
  budget_signals: string[];
  timeline?: string | null;
  decision_criteria: string[];
  requirements: string[];
  questions_asked: string[];
  created_at: string;
}

export interface ActionItem {
  id: string;
  meeting_id: string;
  description: string;
  owner?: string | null;
  due_hint?: string | null;
  status: 'open' | 'done';
  created_at: string;
}

export interface TranscriptInfo {
  id: string;
  meeting_id: string;
  transcript?: string | null;
  mp4_url?: string | null;
  created_at: string;
}

export interface MeetingsV2Response {
  meetings: MeetingV2[];
}

export interface MeetingDetailResponse {
  meeting: MeetingV2;
  transcript: TranscriptInfo | null;
  insights: MeetingInsights | null;
  action_items: ActionItem[];
}

export interface AvailabilitySlot {
  start: string;
  end: string;
}

export interface AvailabilityResponse {
  slots: AvailabilitySlot[];
  timezone: string;
  date: string;
}

export interface CalendarEventCreated {
  id: string;
  summary: string;
  htmlLink: string;
  start: string;
  end: string;
  meetLink?: string;
}

// ---------------------------------------------------------------------------
// Evals & business outcomes (Phase 7)
// ---------------------------------------------------------------------------

export interface BusinessOutcomes {
  workspace_id: string;
  emails_sent: number;
  bounced_count: number;
  delivery_rate: number | null;
  bounce_rate: number | null;
  reply_count: number;
  reply_rate: number | null;
  positive_reply_count: number;
  positive_reply_rate: number | null;
  meeting_booked_count: number;
  unsubscribe_rate: number | null;
  approvals_pending: number;
  pct_approved_unchanged: number | null;
}

export interface BusinessOutcomesResponse {
  outcomes: BusinessOutcomes;
}

export interface EvalRun {
  id: string;
  suite: string;
  dataset_id?: string | null;
  status: 'running' | 'completed' | 'failed';
  started_at: string;
  finished_at?: string | null;
  model?: string | null;
  git_ref?: string | null;
  summary?: Record<string, unknown> | null;
}

export interface EvalRunsResponse {
  runs: EvalRun[];
}
