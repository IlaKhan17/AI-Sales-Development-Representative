import { DashboardTabs } from '@/components/dashboard/DashboardTabs';
import { apiFetchServer } from '@/lib/api-server';
import type { BusinessOutcomesResponse, ProspectV2 } from '@/lib/api-types';
import { getRedis } from '@/utils/redis';
import { createClient } from '@/utils/supabase/server';
import { Zap } from 'lucide-react';

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const supabase = await createClient();

  // Headline stats come from the workspace-scoped v2 API; the legacy tables
  // below only feed the follow-ups / meetings tabs.
  const [v2Prospects, outcomes] = await Promise.all([
    apiFetchServer<{ prospects: ProspectV2[] }>('/v2/prospects', { workspaceId }).catch(
      () => null
    ),
    apiFetchServer<BusinessOutcomesResponse>('/evals/outcomes', { workspaceId }).catch(
      () => null
    ),
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
    <div className="container mx-auto py-8">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                Dashboard
              </h1>
              <p className="text-muted-foreground">
                Overview of your sales pipeline and activity
              </p>
            </div>
          </div>
        </div>
        <DashboardTabs dashboardData={dashboardData} />
      </div>
    </div>
  );
}
