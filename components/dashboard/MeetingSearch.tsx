import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Search, BrainCircuit, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';

import { createClient } from '@/utils/supabase/client';

type MeetingSource = {
  meeting_id: string;
  title: string;
  date: string;
  score: number;
};

type SearchResult = {
  status: string;
  response: string;
  sources: MeetingSource[];
};

export function MeetingSearch() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [meetings, setMeetings] = useState([]);

  const searchKnowledgeBase = async () => {
    if (!query.trim()) {
      toast.error('Please enter a search query');
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        toast.error('Please verify you are logged in');
        return;
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ai-sdr-production-afd7.up.railway.app';
      const response = await fetch(`${apiUrl}/search-knowledge-base`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          query: query,
          max_results: 5,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to search knowledge base');
      }

      const data = await response.json();
      setSearchResult(data);
    } catch (error) {
      console.error('Error searching knowledge base:', error);
      toast.error('Failed to search knowledge base');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      searchKnowledgeBase();
    }
  };

  const getMeetingData = async (meeting: any) => {
    // Implementation of getMeetingData function
  };

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <BrainCircuit className="h-4 w-4 text-primary" />
          Search Meeting Knowledge Base
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Ask anything about your meetings..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              className="pl-9 bg-background/50 border-border/50 focus:bg-background transition-colors"
            />
          </div>
          <Button onClick={searchKnowledgeBase} disabled={loading} size="sm">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Search className="h-4 w-4 mr-2" />
            )}
            Search
          </Button>
        </div>

        {searchResult && (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <h3 className="text-sm font-medium mb-2 text-foreground">Answer</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{searchResult.response}</p>
            </div>

            {searchResult.sources.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2 text-muted-foreground uppercase tracking-wider">Sources</h3>
                <ScrollArea className="h-[150px]">
                  <div className="space-y-2">
                    {searchResult.sources.map((source, index) => (
                      <div
                        key={index}
                        className="rounded-lg border border-border/50 bg-card/50 p-3 cursor-pointer hover:bg-card/80 hover:border-border transition-all"
                        onClick={() => {
                          const meeting = meetings.find((m: any) => m.id === source.meeting_id);
                          if (meeting) {
                            getMeetingData(meeting);
                          } else {
                            toast.error('Meeting details not available');
                          }
                        }}
                      >
                        <div className="flex justify-between items-start">
                          <h4 className="text-sm font-medium">{source.title}</h4>
                          <span className="text-xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-full">
                            {Math.round(source.score * 100)}%
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {new Date(source.date).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
