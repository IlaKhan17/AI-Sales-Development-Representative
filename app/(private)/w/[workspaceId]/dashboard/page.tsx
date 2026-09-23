import { DashboardTabs } from '@/components/dashboard/DashboardTabs';
import { apiFetchServer } from '@/lib/api-server';
import type { BusinessOutcomesResponse, CampaignsResponse, ProspectV2 } from '@/lib/api-types';
import { PageHeader } from '@/components/page-header';
import GoogleConnectButton from '@/components/GoogleConnectButton';
import { getRedis } from '@/utils/redis';
import { createClient } from '@/utils/supabase/server';

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { workspaceId } = await params;
  const { tab } = await searchParams;
  const supabase = await createClient();

  // Headline stats come from the workspace-scoped v2 API; the legacy tables
  // below only feed the follow-ups / meetings tabs.
  const [v2Prospects, outcomes, campaignsRes] = await Promise.all([
    apiFetchServer<{ prospects: ProspectV2[] }>('/v2/prospects', { workspaceId }).catch(
      () => null
    ),
    apiFetchServer<BusinessOutcomesResponse>('/evals/outcomes', { workspaceId }).catch(
      () => null
    ),
    apiFetchServer<CampaignsResponse>('/campaigns', { workspaceId }).catch(() => null),
  ]);

  // Fetch emails with status for analytics
  const { data: emailsData } = await supabase.from('emails').select('*');

  // Fetch all meetings with complete data
  const { data: meetingsData } = await supabase
    .from('meetings')
    .select('*')
    .order('date', { ascending: false });

  // Fetch prospects data
  const { data: prospectsData } = await supabase.from('prospects').select('*');

  // Get analyzed emails from Redis cache (optional — degrades gracefully)
  const redis = getRedis();
  let cachedEmails: string | null = null;
  if (redis) {
    try {
      cachedEmails = await redis.get('analyzed_emails');
    } catch (e) {
      console.error('Failed to read analyzed_emails from Redis:', e);
    }
  }

  // Calculate statistics
  const sentEmails = emailsData?.filter((email) => email.status === 'sent') || [];
  const repliedEmails = emailsData?.filter((email) => email.status === 'replied') || [];
  const responseRate =
    sentEmails.length > 0 ? Math.round((repliedEmails.length / sentEmails.length) * 100) : 0;

  // Calculate average response time (if replied_at and created_at exist)
  let totalResponseTime = 0;
  let responseCount = 0;

  repliedEmails.forEach((email) => {
    if (email.replied_at && email.created_at) {
      const repliedDate = new Date(email.replied_at);
      const sentDate = new Date(email.created_at);
      const diffHours = Math.round((repliedDate.getTime() - sentDate.getTime()) / (1000 * 60 * 60));
      totalResponseTime += diffHours;
      responseCount++;
    }
  });

  const avgResponseHours = responseCount > 0 ? Math.round(totalResponseTime / responseCount) : 24;

  const dashboardData = {
    workspaceId,
    campaigns: campaignsRes?.campaigns ?? [],
    outcomes: outcomes?.outcomes ?? null,
    // Email data
    cachedEmails: JSON.parse(cachedEmails || '[]'),
    emailSent: emailsData || [],

    // Meeting data
    meetings: meetingsData || [],

    // Prospect data
    prospects: prospectsData || [],

    // Statistics
    stats: {
      totalProspects: v2Prospects?.prospects.length ?? prospectsData?.length ?? 0,
      emailsSent: outcomes?.outcomes.emails_sent ?? sentEmails.length,
      responseRate:
        outcomes?.outcomes.reply_rate != null
          ? Math.round(outcomes.outcomes.reply_rate * 100)
          : responseRate,
      avgResponseTime: avgResponseHours,
      completedMeetings: meetingsData?.filter((m) => m.status === 'completed')?.length || 0,
    },
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="What is waiting on you, how campaigns are doing, and what outreach has produced."
        actions={<GoogleConnectButton />}
      />
      <DashboardTabs dashboardData={dashboardData} initialTab={tab} />
    </div>
  );
}
