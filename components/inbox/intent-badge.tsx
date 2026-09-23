import type { ReplyIntent } from '@/lib/api-types';
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

// Grouped by what the reply asks of you: good news, a conversation to have,
// a no, or nothing at all.
const POSITIVE = 'bg-approve/10 text-approve border-approve/30';
const CONVERSATION = 'bg-card text-foreground border-border';
const PUSHBACK = 'bg-caution/10 text-caution border-caution/30';
const NEGATIVE = 'bg-hold/10 text-hold border-hold/30';
const NOISE = 'bg-transparent text-muted-foreground border-border';

const INTENT_CLASSES: Record<ReplyIntent, string> = {
  interested: POSITIVE,
  meeting_requested: POSITIVE,
  needs_information: CONVERSATION,
  referral: CONVERSATION,
  objection: PUSHBACK,
  not_now: PUSHBACK,
  ambiguous: `${PUSHBACK} border-dashed`,
  not_interested: NEGATIVE,
  unsubscribe: NEGATIVE,
  wrong_person: NEGATIVE,
  out_of_office: NOISE,
  automatic: NOISE,
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
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        INTENT_CLASSES[intent] ?? INTENT_CLASSES.ambiguous,
        className
      )}
    >
      {INTENT_LABELS[intent] ?? intent}
      {typeof confidence === 'number' && (
        <span className="ml-1 font-normal opacity-75">{Math.round(confidence * 100)}%</span>
      )}
    </span>
  );
}
