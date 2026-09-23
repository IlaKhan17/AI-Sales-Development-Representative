'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Search, SlidersHorizontal, Plus, Filter, Calendar, ChevronRight } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import ProspectCard from './ProspectCard';
import ProspectModal, { Prospect } from './ProspectModal';
import ProspectPreferencesForm from './ProspectPreferencesForm';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { apiFetch, ApiError } from '@/lib/api';
import type { DiscoveryJob, DiscoveryJobProspectsResponse } from '@/lib/api-types';
// import { formatDistanceToNow } from 'date-fns';

function timeAgo(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + " years ago";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + " months ago";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + " days ago";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + " hours ago";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + " minutes ago";
  return Math.floor(seconds) + " seconds ago";
}

type ProspectListProps = {
  initialProspects: Prospect[];
};

export default function ProspectList({ initialProspects }: ProspectListProps) {
  // State for Prospects
  const [prospects, setProspects] = useState<Prospect[]>(initialProspects);
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('alignment');

  // State for Discovery Jobs (Projects/Folders)
  const [jobs, setJobs] = useState<DiscoveryJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [loadingJobs, setLoadingJobs] = useState(false);

  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Fetch Jobs on Mount
  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    setLoadingJobs(true);
    try {
      const data = await apiFetch<DiscoveryJob[]>('/discovery-jobs');
      setJobs(data);
    } catch (error) {
      console.error("Error fetching jobs:", error);
    } finally {
      setLoadingJobs(false);
    }
  };

  const handleJobSelect = async (jobId: string) => {
    setSelectedJobId(jobId);
    setLoading(true);
    try {
      // Encode the ID since it might contain spaces/special chars (as it is the goal string)
      const encodedId = encodeURIComponent(jobId);
      const data = await apiFetch<DiscoveryJobProspectsResponse>(`/discovery-jobs/${encodedId}/prospects`);
      setProspects(data.prospects || []);
    } catch (error) {
      console.error("Error fetching job prospects:", error);
      if (error instanceof ApiError) {
        toast.error("Failed to load prospects for this project.");
      } else {
        toast.error("Error loading project.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateNewProspects = async (preferences: {
    company_description: string;
    goal: string;
    job_titles: string[];
    enable_playwright?: boolean;
    enable_email_discovery?: boolean;
    keyword_hint?: string;
    icp?: {
      target_industries: string[];
      company_size: string;
      funding_stage: string;
      deal_breakers: string[];
      pain_points_to_target: string[];
    };
  }) => {
    setLoading(true);
    try {
      const data = await apiFetch<DiscoveryJobProspectsResponse>('/prospects/discover', {
        method: 'POST',
        body: {
          company_description: preferences.company_description,
          goal: preferences.goal,
          job_titles: preferences.job_titles,
          enable_playwright: preferences.enable_playwright ?? true,
          enable_email_discovery: preferences.enable_email_discovery ?? true,
          keyword_hint: preferences.keyword_hint ?? '',
          icp: preferences.icp ?? null,
        },
      });
      if (data.prospects && data.prospects.length > 0) {
        setProspects(data.prospects);
        toast.success(`Found ${data.prospects.length} new prospects!`);
        setIsDialogOpen(false);
        // Refresh jobs list to show the new "Project"
        fetchJobs();
        // Select the new project (the goal)
        setSelectedJobId(preferences.goal);
      } else {
        toast.info("No new prospects found with existing criteria.");
      }
    } catch (error) {
      console.error('Error generating prospects:', error);
      toast.error("Failed to generate prospects. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const filteredProspects = prospects
    .filter((prospect) => {
      const query = searchQuery.toLowerCase();
      const author = prospect.author || '';
      const role = prospect.role || '';
      const company = prospect.company || '';
      const industry = prospect.industry || '';

      return (
        author.toLowerCase().includes(query) ||
        role.toLowerCase().includes(query) ||
        company.toLowerCase().includes(query) ||
        industry.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      if (sortBy === 'alignment') {
        return (b.alignment_score || 0) - (a.alignment_score || 0);
      }
      return 0; // Default or 'recent' if db supported date sorting on raw objects better
    });


  return (
    <div className="flex flex-col md:flex-row gap-6">
      {/* Sidebar - Projects / Folders */}
      <div className="w-full md:w-64 space-y-4 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Searches</h2>
        </div>

        <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
          {loadingJobs ? (
            <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : jobs.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              No searches yet.
            </div>
          ) : (
            jobs.map((job) => (
              <button
                key={job.id}
                onClick={() => handleJobSelect(job.id)}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-md text-sm transition-colors",
                  selectedJobId === job.id
                    ? "bg-card ring-1 ring-border shadow-[inset_2px_0_0_hsl(var(--primary))]"
                    : "hover:bg-card/70"
                )}
              >
                <div className="font-medium truncate pr-2 mb-1" title={job.name}>{job.name}</div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {job.date ? timeAgo(job.date) : 'Recently'}
                  </span>
                  <span className="bg-secondary px-1.5 py-0.5 rounded-full text-secondary-foreground text-[10px] font-bold">
                    {job.prospect_count}
                  </span>
                </div>
                {/* companies preview */}
                <div className="mt-2 flex flex-wrap gap-1">
                  {job.companies.map((c, i) => (
                    <span key={i} className="text-[10px] px-1 bg-background/50 rounded border border-border/30 truncate max-w-[60px] inline-block">
                      {c}
                    </span>
                  ))}
                </div>

              </button>
            ))
          )}
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full">
              <Plus className="mr-2 h-4 w-4" />
              New search
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px] max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New search</DialogTitle>
              <DialogDescription>
                Describe who you are looking for. Paste a job description to fill the fields for you.
              </DialogDescription>
            </DialogHeader>
            <ProspectPreferencesForm onSubmit={handleGenerateNewProspects} isLoading={loading} />
          </DialogContent>
        </Dialog>
      </div>


      {/* Main Content - Prospect List */}
      <div className="flex-1 space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, role, or company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-card"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[160px] bg-card">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alignment">Highest score</SelectItem>
                <SelectItem value="recent">Most recent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading prospects</p>
          </div>
        ) : filteredProspects.length === 0 ? (
          <div className="flex flex-col items-center justify-center space-y-3 rounded-md border border-dashed border-border py-16 text-center">
            <Search className="h-6 w-6 text-muted-foreground" />
            <div className="space-y-1">
              <h3 className="text-base font-semibold">
                {prospects.length === 0 && !selectedJobId ? 'Pick a search' : 'No prospects to show'}
              </h3>
              <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                {prospects.length === 0
                  ? (selectedJobId ? 'This search found nobody who matched.' : 'Choose a search on the left to see who it found, or start a new one.')
                  : 'Nobody matches that filter. Try a different name, role or company.'}
              </p>
            </div>
            {!selectedJobId && (
              <Button onClick={() => setIsDialogOpen(true)} variant="outline" className="mt-2">
                New search
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
            {filteredProspects.map((prospect, index) => (
              <ProspectCard
                key={index}
                prospect={prospect}
                onClick={() => setSelectedProspect(prospect)}
              />
            ))}
          </div>
        )}

        {selectedProspect && (
          <ProspectModal prospect={selectedProspect} onClose={() => setSelectedProspect(null)} />
        )}
      </div>
    </div>
  );
}

