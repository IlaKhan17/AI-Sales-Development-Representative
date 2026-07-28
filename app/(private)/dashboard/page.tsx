import { redirect } from 'next/navigation';

// Legacy route: dashboard now lives under workspace-scoped URLs.
export default function LegacyDashboardPage() {
  redirect('/workspaces');
}
