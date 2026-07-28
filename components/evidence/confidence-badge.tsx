import { cn } from '@/lib/utils';

/**
 * Colored confidence badge: >=0.8 green, >=0.5 amber, otherwise gray.
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
      <span
        className={cn(
          'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground',
          className
        )}
      >
        n/a
      </span>
    );
  }
  const tone =
    confidence >= 0.8
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900'
      : confidence >= 0.5
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-900'
        : 'bg-muted text-muted-foreground border-border';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums',
        tone,
        className
      )}
    >
      {Math.round(confidence * 100)}%
    </span>
  );
}
