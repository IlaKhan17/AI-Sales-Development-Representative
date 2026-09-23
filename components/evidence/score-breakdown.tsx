import type { ProspectScore } from '@/lib/api-types';
import { cn } from '@/lib/utils';

const COMPONENT_LABELS: Record<string, string> = {
  role: 'Role',
  industry: 'Industry',
  company_size: 'Company size',
  geography: 'Geography',
  buying_signals: 'Buying signals',
  technology: 'Technology',
};

// Display order follows how a seller reads a lead: who, where, how big, why now.
const COMPONENT_ORDER = [
  'role',
  'industry',
  'company_size',
  'geography',
  'technology',
  'buying_signals',
];

export function formatPoints(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Superscript links to numbered sources in the evidence column. */
export function Citations({ numbers }: { numbers: number[] }) {
  if (numbers.length === 0) return null;
  return (
    <span className="ml-1 whitespace-nowrap">
      {numbers.map((n) => (
        <a
          key={n}
          href={`#source-${n}`}
          aria-label={`Source ${n}`}
          className="ml-0.5 rounded-sm bg-highlight/45 px-1 align-[0.35em] text-[0.72em] font-semibold leading-none text-foreground hover:bg-highlight"
        >
          [{n}]
        </a>
      ))}
    </span>
  );
}

/**
 * The score as a ledger: one line per ICP component with the rule's reason
 * and the sources that support it, summing to the total.
 */
export function ScoreBreakdown({
  score,
  citations = {},
}: {
  score: ProspectScore | null;
  citations?: Record<string, number[]>;
}) {
  if (!score) {
    return (
      <section className="rounded-md border border-dashed border-border px-5 py-8 text-sm text-muted-foreground">
        Not scored yet. The score appears once research and scoring finish.
      </section>
    );
  }

  const components = score.component_scores as Record<
    string,
    { points: number; max: number; reason?: string | null } | undefined
  >;
  const keys = [
    ...COMPONENT_ORDER.filter((k) => components[k]),
    ...Object.keys(components).filter(
      (k) => !COMPONENT_ORDER.includes(k) && !k.startsWith('_')
    ),
  ];
  const coverage = components['_evidence_coverage'];

  return (
    <section aria-labelledby="score-heading" className="rounded-md border border-border bg-card">
      <h2 id="score-heading" className="px-5 pt-4 text-base font-semibold">
        Why this score
      </h2>
      <p className="px-5 pb-3 text-sm text-muted-foreground">
        Each line is a fixed rule applied to cited evidence, so the same evidence always gives the
        same score.
      </p>
      <ol className="border-t border-border">
        {keys.map((key) => {
          const c = components[key]!;
          const full = c.max > 0 && c.points >= c.max;
          const none = c.points <= 0;
          return (
            <li
              key={key}
              className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 border-b border-border px-5 py-3 last:border-b-0 sm:grid-cols-[9rem_1fr_auto]"
            >
              <span className="text-sm font-medium">{COMPONENT_LABELS[key] ?? key}</span>
              <span
                className={cn(
                  'row-start-2 col-span-2 text-sm leading-relaxed text-muted-foreground sm:row-start-auto sm:col-span-1'
                )}
              >
                {c.reason || 'No rule applied.'}
                <Citations numbers={citations[key] ?? []} />
              </span>
              <span
                className={cn(
                  'text-right text-sm',
                  full && 'font-semibold text-foreground',
                  none && 'text-muted-foreground'
                )}
              >
                {formatPoints(c.points)}
                <span className="text-muted-foreground"> of {formatPoints(c.max)}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <div className="flex items-baseline justify-between gap-4 border-t-2 border-foreground px-5 py-4">
        <span className="text-sm font-semibold">Total</span>
        <span className="text-3xl font-bold tracking-tight">
          {formatPoints(score.total)}
          <span className="text-base font-medium text-muted-foreground"> of 100</span>
        </span>
      </div>
      {coverage && (
        <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
          Evidence covers {Math.round((coverage.points / (coverage.max || 1)) * 100)}% of the
          scored categories, weighted by source confidence.
        </p>
      )}
    </section>
  );
}
