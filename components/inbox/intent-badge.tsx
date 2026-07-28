import type { ReplyIntent } from '@/lib/api-types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export const INTENT_LABELS: Record<ReplyIntent, string> = {
  interested: 'Interested',
  meeting_requested: 'Meeting requested',
  needs_information: 'Needs information',
  objection: 'Objection',
  referral: 'Referral',
  not_now: 'Not now',
  not_interested: 'Not interested',
  unsubscribe: 'Unsubscribe',
  out_of_office: 'Out of office',
  wrong_person: 'Wrong person',
  automatic: 'Automatic',
  ambiguous: 'Ambiguous',
};

const INTENT_CLASSES: Record<ReplyIntent, string> = {
  interested:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  meeting_requested:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  needs_information:
    'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  referral: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  objection:
    'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  not_now: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  not_interested:
    'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  unsubscribe: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  wrong_person: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  out_of_office:
    'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  automatic: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  ambiguous:
    'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
};

export function IntentBadge({
  intent,
  confidence,
  className,
}: {
  intent: ReplyIntent;
  confidence?: number;
  className?: string;
}) {
  return (
    <Badge
      variant="secondary"
      className={cn(INTENT_CLASSES[intent] ?? INTENT_CLASSES.ambiguous, className)}
    >
      {INTENT_LABELS[intent] ?? intent}
      {typeof confidence === 'number' && (
        <span className="ml-1 opacity-75">{Math.round(confidence * 100)}%</span>
      )}
    </Badge>
  );
}
