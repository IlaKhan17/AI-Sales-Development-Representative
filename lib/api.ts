'use client';

import { env } from '@/lib/env';
import { createClient } from '@/utils/supabase/client';
import { ApiError, type ApiFetchOptions } from '@/lib/api-error';

export { ApiError };
export type { ApiFetchOptions };

/**
 * Typed client-side API helper. Attaches the Supabase JWT and (optionally)
 * the active workspace id. Throws ApiError on non-2xx responses.
 */
export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { method = 'GET', body, workspaceId, signal } = options;

  const supabase = createClient();
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

  // Some endpoints (e.g. DELETE) return 204 No Content.
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}
