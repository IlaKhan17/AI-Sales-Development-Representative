'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DashboardOverview } from './DashboardOverview';
import { EmailAnalysis, FollowUps } from './FollowUps';
import { Meeting, MeetingNotes } from './MeetingNotes';
import { CalendarEvents } from './CalendarEvents';
import { Prospect } from '../ProspectModal';
import type { BusinessOutcomes, Campaign } from '@/lib/api-types';

export type EmailSent = {
  recipient?: string;
  subject?: string;
  body?: string;
  status?: string;
};

export type DashboardData = {
  workspaceId: string;
  campaigns: Campaign[];
  outcomes: BusinessOutcomes | null;
  cachedEmails: EmailAnalysis[];
  meetings: Meeting[];
  emailSent: EmailSent[];
  prospects: Prospect[];
  stats: {
    totalProspects: number;
    emailsSent: number;
    responseRate: number;
    avgResponseTime: number;
    completedMeetings: number;
  };
};

export type DashboardTabsProps = {
  dashboardData: DashboardData;
  initialTab?: string;
};

const TABS = ['overview', 'follow-ups', 'meetings', 'calendar'];

export function DashboardTabs({ dashboardData, initialTab }: DashboardTabsProps) {
  return (
    <Tabs
      key={initialTab ?? 'overview'}
      defaultValue={initialTab && TABS.includes(initialTab) ? initialTab : 'overview'}
      className="space-y-8"
    >
      <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-border bg-transparent p-0">
        {[
          ['overview', 'Overview'],
          ['follow-ups', 'Follow-ups'],
          ['meetings', 'Meeting notes'],
          ['calendar', 'Calendar'],
        ].map(([value, label]) => (
          <TabsTrigger
            key={value}
            value={value}
            className="-mb-px rounded-none border-b-2 border-transparent px-3 py-2.5 text-sm text-muted-foreground shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            {label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="overview" className="space-y-6 focus-visible:outline-none focus-visible:ring-0">
        <DashboardOverview dashboardOverview={dashboardData} />
      </TabsContent>

      <TabsContent value="follow-ups" className="space-y-6 focus-visible:outline-none focus-visible:ring-0">
        <FollowUps initialEmails={dashboardData.cachedEmails} />
      </TabsContent>

      <TabsContent value="meetings" className="space-y-6 focus-visible:outline-none focus-visible:ring-0">
        <MeetingNotes initialMeetings={dashboardData.meetings} />
      </TabsContent>

      <TabsContent value="calendar" className="space-y-6 focus-visible:outline-none focus-visible:ring-0">
        <CalendarEvents />
      </TabsContent>
    </Tabs>
  );
}
