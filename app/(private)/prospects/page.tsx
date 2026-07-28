import { redirect } from 'next/navigation';

// Legacy route: prospects now live under workspace-scoped URLs.
export default function LegacyProspectsPage() {
  redirect('/workspaces');
}
