'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWorkspace } from '@/components/providers/workspace-provider';
import { cn } from '@/lib/utils';

const TABS = [
  { label: 'General', segment: '' },
  { label: 'Members', segment: '/members' },
  { label: 'Integrations', segment: '/integrations' },
  { label: 'Do not email', segment: '/suppression' },
];

export function SettingsNav() {
  const { workspace } = useWorkspace();
  const pathname = usePathname();
  const base = `/w/${workspace.id}/settings`;

  // The settings pages share this frame: page title, then tabs. Each tab's own
  // heading sits below as a section title.
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Settings</h1>
        <p className="mt-1.5 max-w-2xl text-base text-muted-foreground">
          Your company profile, who has access, connected accounts, and who never gets emailed.
        </p>
      </div>
      <nav aria-label="Settings" className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((tab) => {
          const href = `${base}${tab.segment}`;
          const active = pathname === href;
          return (
            <Link
              key={tab.label}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                '-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors',
                active
                  ? 'border-foreground font-semibold text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
