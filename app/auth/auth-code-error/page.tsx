import Link from "next/link";

export default function AuthCodeError() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md space-y-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Davis
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Sign-in didn&apos;t finish</h1>
        <p className="text-muted-foreground">
          The sign-in link expired or the Google or GitHub window was closed before it finished.
          Nothing was changed. Sign in again to continue.
        </p>
        <Link
          href="/login"
          className="inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
