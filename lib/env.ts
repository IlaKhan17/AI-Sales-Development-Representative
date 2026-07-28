import { z } from 'zod';

/**
 * Validated public environment variables.
 *
 * NEXT_PUBLIC_* vars are inlined at build time by Next.js, so they MUST be
 * referenced explicitly (process.env.NEXT_PUBLIC_X) — dynamic access like
 * process.env[name] does not work in client bundles.
 */
const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url({
    message: 'NEXT_PUBLIC_SUPABASE_URL must be a valid URL',
  }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, {
    message: 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required',
  }),
  NEXT_PUBLIC_API_URL: z.string().url({
    message: 'NEXT_PUBLIC_API_URL must be a valid URL',
  }),
});

const parsed = envSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
});

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(
    `Invalid or missing public environment variables:\n${issues}\n` +
      'Set them in .env.local (dev) or your deployment environment (Vercel).'
  );
}

export const env = parsed.data;
