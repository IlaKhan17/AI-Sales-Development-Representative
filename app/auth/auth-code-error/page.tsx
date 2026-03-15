import Link from "next/link";

export default function AuthCodeError() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4 max-w-md px-4">
        <h1 className="text-2xl font-bold">Authentication Failed</h1>
        <p className="text-muted-foreground">
          Something went wrong during sign in. This can happen if the login
          session expired or the authentication was cancelled.
        </p>
        <Link
          href="/login"
          className="inline-block mt-4 px-6 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Try Again
        </Link>
      </div>
    </div>
  );
}
