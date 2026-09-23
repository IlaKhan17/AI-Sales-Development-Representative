'use client';

import GoogleConnectButton from '@/components/GoogleConnectButton';
import { SettingsNav } from '@/components/settings/settings-nav';

export default function IntegrationsPage() {
  return (
    <div className="max-w-4xl space-y-8">
      <SettingsNav />
      <div>
        <h2 className="text-lg font-semibold">Integrations</h2>
        <p className="text-sm text-muted-foreground">
          Accounts Davis uses on your behalf. Connect Google before approving any email.
        </p>
      </div>
      <section className="grid gap-4 rounded-md border border-border bg-card p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div>
          <h3 className="font-semibold">Google</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Sends approved emails from your Gmail, reads replies to them, and books meetings on your
            Google Calendar. Google will ask you to allow Gmail send, read and modify access, and
            Calendar access.
          </p>
        </div>
        <GoogleConnectButton />
      </section>
    </div>
  );
}
