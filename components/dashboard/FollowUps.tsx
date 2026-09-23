"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, RefreshCw, Send, Mail, User, ArrowRight, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { apiFetch, ApiError } from "@/lib/api"
import type { ReplyAnalysis as EmailAnalysis, RepliesResponse } from "@/lib/api-types"

export type { EmailAnalysis }

type FollowUpsProps = {
  initialEmails: EmailAnalysis[]
}

export function FollowUps({ initialEmails }: FollowUpsProps) {
  const [loading, setLoading] = useState(false)
  const [analyzedEmails, setAnalyzedEmails] = useState<EmailAnalysis[]>(initialEmails)
  const [selectedEmail, setSelectedEmail] = useState<EmailAnalysis | null>(null)
  const [editedFollowup, setEditedFollowup] = useState("")

  const fetchReplies = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<RepliesResponse>('/emails/replies')
      setAnalyzedEmails(data.analyzed_emails)
      toast.success(data.message)
    } catch (error: any) {
      if (error instanceof ApiError && error.status === 400) {
        toast.error('Please connect your Google account first')
        return
      }
      toast.error(error.message || 'Failed to fetch replies')
    } finally {
      setLoading(false)
    }
  }

  const handleSendFollowup = async () => {
    if (!selectedEmail?.suggested_followup) return

    try {
      const followup = selectedEmail.suggested_followup
      const body = editedFollowup || followup.body

      await apiFetch('/emails/send', {
        method: 'POST',
        body: {
          to: followup.recipient,
          subject: followup.subject,
          body: body,
        },
      })

      toast.success('Follow-up email sent via Gmail!')
      setSelectedEmail(null)
    } catch (error: any) {
      toast.error(error.message || 'Failed to send follow-up email')
    }
  }

  const getSentimentColor = (sentiment: string) => {
    if (sentiment.includes("Positive")) return "bg-approve/10 text-approve border-approve/30"
    if (sentiment.includes("Negative")) return "bg-hold/10 text-hold border-hold/30"
    return "bg-caution/10 text-caution border-caution/30"
  }

  return (
    <div className="space-y-6 fade-in-bottom">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Email Replies</h2>
            <p className="text-sm text-muted-foreground">AI-analyzed responses requiring your attention</p>
          </div>
        </div>
        <Button onClick={fetchReplies} disabled={loading} className="shadow-sm">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Analyze Replies
        </Button>
      </div>

      <div className="grid gap-4">
        {analyzedEmails.map((item, index) => (
          <Card key={index} className="glass-card hover:bg-card transition-all overflow-hidden border-l-4 border-l-primary/50">
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row items-start justify-between gap-6">
                <div className="grid gap-3 flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-sm font-medium">
                      <User className="h-3 w-3" />
                      {item.email.from}
                    </div>
                    <Badge variant="outline" className="text-xs">{item.analysis.intent}</Badge>
                    <div className={cn("text-xs font-medium px-2 py-0.5 rounded-full border", getSentimentColor(item.analysis.sentiment))}>
                      {item.analysis.sentiment}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold">{item.email.subject}</h3>
                    <p className="text-muted-foreground text-sm mt-1 line-clamp-2">{item.email.body}</p>
                  </div>
                </div>

                {item.suggested_followup && (
                  <div className="flex-shrink-0">
                    <Button
                      className="w-full md:w-auto"
                      onClick={() => {
                        setSelectedEmail(item)
                        setEditedFollowup(item.suggested_followup?.body || "")
                      }}
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      Review Draft
                      <ArrowRight className="ml-2 h-4 w-4 opacity-50" />
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}

        {analyzedEmails.length === 0 && !loading && (
          <div className="text-center py-20 border-2 border-dashed rounded-md bg-card">
            <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Mail className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium">No replies pending</h3>
            <p className="text-muted-foreground mt-1 max-w-xs mx-auto">Click &quot;Analyze Replies&quot; to check for new responses from your campaigns.</p>
          </div>
        )}
      </div>

      {selectedEmail && (
        <Dialog open={true} onOpenChange={() => setSelectedEmail(null)}>
          <DialogContent className="sm:max-w-[700px] glass-card border-none">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                AI Suggested Follow-up
              </DialogTitle>
              <DialogDescription>
                Review and customize the AI-generated response before sending.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 py-4">
              <div className="grid gap-4 p-4 rounded-lg bg-muted/50 border">
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">To</span>
                  <p className="text-sm font-medium">{selectedEmail.suggested_followup?.recipient}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Subject</span>
                  <p className="text-sm font-medium">{selectedEmail.suggested_followup?.subject}</p>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-medium text-muted-foreground">Message Content</span>
                <Textarea
                  value={editedFollowup}
                  onChange={(e) => setEditedFollowup(e.target.value)}
                  rows={8}
                  className="resize-none bg-background/50 font-mono text-sm leading-relaxed"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedEmail(null)}>Cancel</Button>
              <Button onClick={handleSendFollowup}>
                <Send className="mr-2 h-4 w-4" />
                Send Response
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

