import { cn } from '@/lib/utils';

/**
 * Source confidence as a short phrase: strong (>=0.8), fair (>=0.5), weak.
 * Only strong earns the approve color; the rest stay quiet.
 */
export function ConfidenceBadge({
  confidence,
  className,
}: {
  confidence: number | null | undefined;
  className?: string;
}) {
  if (confidence === null || confidence === undefined) {
    return (
      <span className={cn('text-xs text-muted-foreground', className)}>Confidence unknown</span>
    );
  }
  const pct = Math.round(confidence * 100);
  const [label, tone] =
    confidence >= 0.8
      ? ['Strong', 'text-approve']
      : confidence >= 0.5
        ? ['Fair', 'text-caution']
        : ['Weak', 'text-muted-foreground'];
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-xs', className)}
      title={`Confidence ${pct}%`}
    >
      <span className={cn('font-semibold', tone)}>{label}</span>
      <span className="text-muted-foreground">{pct}%</span>
    </span>
  );
}
