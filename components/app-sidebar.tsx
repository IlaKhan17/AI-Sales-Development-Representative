'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useWorkspaceOptional } from '@/components/providers/workspace-provider';
import {
    LayoutDashboard,
    Users,
    Mail,
    LogOut,
    ChevronLeft,
    ChevronRight,
    Menu,
    X,
    Target,
    Megaphone,
    Settings,
    CheckSquare,
    Inbox,
    BarChart3,
    Video
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApprovalCounts } from '@/lib/hooks/use-approvals';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface SidebarProps {
    user: any;
}

export function AppSidebar({ user }: SidebarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const supabase = createClient();

    // Sidebar is rendered by app/(private)/layout.tsx, outside the workspace
    // segment, so workspace context may be absent (e.g. on /profile).
    const workspaceCtx = useWorkspaceOptional();
    // The sidebar lives outside the /w/[workspaceId] layout, so also derive
    // the active workspace from the URL when context is unavailable.
    const wsFromPath = pathname?.match(/^\/w\/([^/]+)/)?.[1];
    const activeWorkspaceId = workspaceCtx?.workspace.id ?? wsFromPath ?? '';
    // Without a known workspace there is no valid /w/<id> URL to build, so send
    // nav links to /workspaces, which resolves the user's workspace and
    // redirects (or to onboarding when they have none).
    const wsHref = (path: string) =>
        activeWorkspaceId ? `/w/${activeWorkspaceId}${path}` : '/workspaces';

    const approvalCounts = useApprovalCounts(activeWorkspaceId);
    const pendingApprovals = approvalCounts.data?.pending ?? 0;

    // Grouped by the order work flows through Davis: find and judge
    // prospects, decide on outreach, then the setup that drives it.
    const groups: {
        label: string;
        routes: { label: string; icon: typeof LayoutDashboard; href: string; badge?: number }[];
    }[] = [
        {
            label: 'Pipeline',
            routes: [
                { label: 'Dashboard', icon: LayoutDashboard, href: wsHref('/dashboard') },
                { label: 'Campaigns', icon: Megaphone, href: wsHref('/campaigns') },
                { label: 'Prospects', icon: Users, href: wsHref('/prospects') },
                { label: 'Approvals', icon: CheckSquare, href: wsHref('/approvals'), badge: pendingApprovals },
                { label: 'Inbox', icon: Inbox, href: wsHref('/inbox') },
                { label: 'Meetings', icon: Video, href: wsHref('/meetings') },
                { label: 'Follow-ups', icon: Mail, href: wsHref('/dashboard?tab=follow-ups') },
            ],
        },
        {
            label: 'Setup',
            routes: [
                { label: 'Ideal customer', icon: Target, href: wsHref('/icp') },
                { label: 'Evals', icon: BarChart3, href: wsHref('/evals') },
                { label: 'Settings', icon: Settings, href: wsHref('/settings') },
            ],
        },
    ];

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.refresh();
    };

    return (
        <>
            {/* Mobile Trigger */}
            <div className="lg:hidden fixed top-4 left-4 z-50">
                <Button variant="outline" size="icon" aria-label={mobileOpen ? "Close menu" : "Open menu"} onClick={() => setMobileOpen(!mobileOpen)} className="bg-card">
                    {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                </Button>
            </div>

            {/* Sidebar */}
            <nav
                aria-label="Workspace"
                className={cn(
                    "fixed inset-y-0 left-0 z-40 flex flex-col h-full transition-[width,transform] duration-200 ease-out border-r border-sidebar-border bg-sidebar",
                    collapsed ? "w-[72px]" : "w-64",
                    mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
                )}
            >
                <div className={cn("flex items-center justify-between h-16 px-5", collapsed && "justify-center px-0")}>
                    <Link href={wsHref('/dashboard')} className="flex items-baseline gap-1.5 overflow-hidden">
                        <span className="text-lg font-bold tracking-tight text-foreground">{collapsed ? 'D' : 'Davis'}</span>
                    </Link>
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Collapse sidebar"
                        className={cn("hidden lg:flex h-7 w-7 text-muted-foreground", collapsed && "hidden")}
                        onClick={() => setCollapsed(true)}
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                </div>

                {collapsed && (
                    <div className="hidden lg:flex justify-center mb-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Expand sidebar"
                            className="h-7 w-7 text-muted-foreground"
                            onClick={() => setCollapsed(false)}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-6">
                    {groups.map((group) => (
                        <div key={group.label}>
                            {!collapsed && (
                                <p className="px-3 pb-1.5 text-xs font-medium text-muted-foreground">{group.label}</p>
                            )}
                            <ul className="space-y-0.5">
                                {group.routes.map((route) => {
                                    const [routePath, routeQuery] = route.href.split('?');
                                    const active = routeQuery ? false : pathname === routePath;
                                    return (
                                        <li key={route.label}>
                                            <Link
                                                href={route.href}
                                                aria-current={active ? 'page' : undefined}
                                                title={collapsed ? route.label : undefined}
                                                className={cn(
                                                    "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                                                    active
                                                        ? "bg-sidebar-accent text-foreground font-semibold shadow-[inset_2px_0_0_hsl(var(--primary))]"
                                                        : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                                                    collapsed && "justify-center px-0"
                                                )}
                                            >
                                                <route.icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2.25 : 1.75} />
                                                {!collapsed && <span className="truncate">{route.label}</span>}
                                                {!collapsed && route.badge !== undefined && route.badge > 0 && (
                                                    <span className="ml-auto tabular rounded-full bg-primary px-1.5 py-px text-[11px] font-semibold text-primary-foreground">
                                                        {route.badge}
                                                    </span>
                                                )}
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                </div>

                <div className={cn("border-t border-sidebar-border p-3", collapsed && "px-2")}>
                    <div className={cn("flex items-center gap-3 px-2 py-1.5", collapsed && "justify-center px-0")}>
                        <Avatar className="h-8 w-8">
                            <AvatarImage src={user?.user_metadata?.avatar_url} />
                            <AvatarFallback className="bg-card text-foreground text-xs font-semibold border border-border">
                                {user?.email?.charAt(0).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                        {!collapsed && (
                            <span className="min-w-0 flex-1 truncate text-sm text-foreground">{user?.email}</span>
                        )}
                    </div>
                    <Button
                        variant="ghost"
                        className={cn(
                            "mt-1 h-9 w-full justify-start gap-2 px-2 text-sm font-normal text-muted-foreground hover:text-foreground",
                            collapsed && "justify-center px-0"
                        )}
                        onClick={handleLogout}
                        title={collapsed ? "Log out" : undefined}
                    >
                        <LogOut className="h-4 w-4" />
                        {!collapsed && 'Log out'}
                    </Button>
                </div>
            </nav>

            {/* Mobile Overlay */}
            {mobileOpen && (
                <div
                    className="fixed inset-0 z-30 bg-foreground/30 lg:hidden"
                    onClick={() => setMobileOpen(false)}
                />
            )}
        </>
    );
}
