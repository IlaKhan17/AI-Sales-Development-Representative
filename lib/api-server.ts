import { env } from '@/lib/env';
import { createClient } from '@/utils/supabase/server';
import { ApiError, type ApiFetchOptions } from '@/lib/api-error';

export { ApiError };

/**
 * Server-side (RSC / route handler) variant of apiFetch. Reads the Supabase
 * session from cookies via utils/supabase/server.
 */
export async function apiFetchServer<T>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { method = 'GET', body, workspaceId, signal } = options;

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = {};
  if (session) headers['Authorization'] = `Bearer ${session.access_token}`;
  if (workspaceId) headers['X-Workspace-Id'] = workspaceId;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${env.NEXT_PUBLIC_API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
    cache: 'no-store',
  });

  if (!response.ok) {
    let detail: unknown;
    try {
      const data = await response.json();
      detail = data?.detail ?? data;
    } catch {
      detail = response.statusText;
    }
    throw new ApiError(response.status, detail);
  }

  return (await response.json()) as T;
}
