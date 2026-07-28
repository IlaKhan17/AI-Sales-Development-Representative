'use client';

import GoogleConnectButton from '@/components/GoogleConnectButton';
import { SettingsNav } from '@/components/settings/settings-nav';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function IntegrationsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <SettingsNav />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Connected accounts used for sending email and booking meetings.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Google</CardTitle>
          <CardDescription>
            Gmail (sending, reply tracking) and Google Calendar (booking).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GoogleConnectButton />
        </CardContent>
      </Card>
    </div>
  );
}
