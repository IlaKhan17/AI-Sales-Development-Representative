'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWorkspace } from '@/components/providers/workspace-provider';
import { cn } from '@/lib/utils';

const TABS = [
  { label: 'General', segment: '' },
  { label: 'Members', segment: '/members' },
  { label: 'Integrations', segment: '/integrations' },
  { label: 'Suppression', segment: '/suppression' },
];

export function SettingsNav() {
  const { workspace } = useWorkspace();
  const pathname = usePathname();
  const base = `/w/${workspace.id}/settings`;

  return (
    <nav className="flex gap-1 border-b pb-px">
      {TABS.map((tab) => {
        const href = `${base}${tab.segment}`;
        const active = pathname === href;
        return (
          <Link
            key={tab.label}
            href={href}
            className={cn(
              'rounded-t-md border-b-2 px-3 py-2 text-sm transition-colors',
              active
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
