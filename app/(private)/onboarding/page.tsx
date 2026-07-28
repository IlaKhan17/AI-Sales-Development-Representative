import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';

export default function OnboardingPage() {
  return (
    <div className="space-y-2">
      <div className="mx-auto max-w-2xl pt-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          Set up your workspace
        </h1>
        <p className="text-sm text-muted-foreground">
          A few details so Davis can prospect and write on-message outreach.
        </p>
      </div>
      <OnboardingWizard />
    </div>
  );
}
