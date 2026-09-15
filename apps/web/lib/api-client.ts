/**
 * apps/web/lib/api-client.ts — typed fetch wrapper.
 *
 * Base URL from NEXT_PUBLIC_API_BASE_URL (the gateway). Attaches Authorization
 * from the session. Server components use it with cache:'no-store' where legacy
 * used dynamic data.
 */

import type { Session } from 'next-auth';

const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(`API ${status}: ${JSON.stringify(body)}`);
    this.name = 'ApiError';
  }
}

export interface ApiClientOptions {
  session?: Session | null;
  cache?: RequestCache;
  revalidate?: number;
}

export async function apiFetch<T = unknown>(path: string, options: ApiClientOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (options.session?.accessToken) {
    headers.authorization = `Bearer ${options.session.accessToken}`;
  }
  const res = await fetch(`${baseUrl}${path}`, {
    headers,
    cache: options.cache ?? 'no-store',
    next: options.revalidate ? { revalidate: options.revalidate } : undefined,
  });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    throw new ApiError(res.status, body);
  }
  return res.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string, options?: ApiClientOptions) => apiFetch<T>(path, options),
  post: <T>(path: string, body?: unknown, options?: ApiClientOptions) =>
    apiFetch<T>(path, { ...options, ...(body ? { body: JSON.stringify(body) } : {}) }),
};

export { baseUrl };
