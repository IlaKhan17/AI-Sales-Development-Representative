import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * The one page header used across the app: optional back link, a large
 * title (with an optional status chip beside it), a plain-language
 * description, and actions aligned to the bottom edge, closed by a rule.
 */
export function PageHeader({
  title,
  description,
  back,
  status,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  back?: { href: string; label: string };
  status?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('space-y-4', className)}>
      {back && (
        <Link
          href={back.href}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
            {status}
          </div>
          {description && (
            <div className="max-w-2xl text-base text-muted-foreground">{description}</div>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** A titled region inside a page: heading, one line of context, then content. */
export function PageSection({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/**
 * A form section: what the fields are for on the left, the fields on a sheet
 * on the right. Stacks on small screens.
 */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'grid gap-4 border-b border-border pb-8 last:border-b-0 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-10',
        className
      )}
    >
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-5 rounded-md border border-border bg-card p-5">{children}</div>
    </section>
  );
}
