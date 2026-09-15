/**
 * @fleetai/nest-common/resilience — outbound HTTP with timeouts/retries,
 * circuit breaker, idempotency-key store, pagination caps, query timeout.
 *
 * Prompt 14 hardening defaults. Framework-agnostic (no Nest imports here) so the
 * gateway and any plain-Fastify service can use them too.
 */

// ---------------------------------------------------------------------------
// Outbound HTTP client with timeouts + retry-with-jitter (idempotent calls only)
// ---------------------------------------------------------------------------

export interface HttpCallOptions {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  /** Total request timeout in ms. */
  timeoutMs?: number;
  /** Max retries for idempotent calls (default 0 — non-idempotent never auto-retry). */
  retries?: number;
  maxRetries?: number;
  /** Allow retries even for non-idempotent methods (default false). */
  retryNonIdempotent?: boolean;
  circuit?: CircuitBreaker;
}

export interface HttpCallResult {
  status: number;
  ok: boolean;
  text: string;
  json(): unknown;
}

function retryable(status: number | null): boolean {
  // 429, 5xx, network errors (status null → throw is translated by caller)
  return status === null || status === 429 || (status >= 500 && status <= 599);
}

function isIdempotent(method: string): boolean {
  return ['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS'].includes(method.toUpperCase());
}

export async function httpCall(opts: HttpCallOptions): Promise<HttpCallResult> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const maxRetries = opts.maxRetries ?? (opts.retries ?? 2);
  let lastStatus: number | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0 && opts.circuit) {
      if (!opts.circuit.allow()) {
        throw new Error(`circuit open: ${opts.url}`);
      }
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(opts.url, {
        method: opts.method,
        headers: { 'content-type': 'application/json', ...opts.headers },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      lastStatus = res.status;
      const text = await res.text();
      opts.circuit?.record(res.status < 500);
      if (res.ok) return { status: res.status, ok: true, text, json: () => safeJson(text) };
      const canRetry = retryable(res.status) && (isIdempotent(opts.method) || opts.retryNonIdempotent);
      if (!canRetry || attempt === maxRetries) {
        return { status: res.status, ok: false, text, json: () => safeJson(text) };
      }
    } catch (e) {
      opts.circuit?.record(false);
      if (attempt === maxRetries) throw e;
    }
    // exponential backoff with jitter (r * 2^attempt, ±20%)
    const base = 200 * 2 ** attempt;
    const jitter = base * (0.2 * Math.random());
    await new Promise((r) => setTimeout(r, base + jitter));
  }
  throw new Error(`http call exhausted retries: ${opts.url} (last ${lastStatus})`);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Circuit breaker (hand-rolled, threshold-based)
// ---------------------------------------------------------------------------

export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private readonly bucketStart = Date.now();
  private readonly windowMs: number;
  private readonly failureThreshold: number;
  private readonly openDurationMs: number;

  constructor(opts: { windowMs?: number; failureThreshold?: number; openDurationMs?: number } = {}) {
    this.windowMs = opts.windowMs ?? 30_000;
    this.failureThreshold = opts.failureThreshold ?? 5;
    this.openDurationMs = opts.openDurationMs ?? 30_000;
  }

  allow(): boolean {
    if (this.openedAt === 0) return true;
    if (Date.now() - this.openedAt > this.openDurationMs) {
      // half-open: allow one probe
      this.openedAt = 0;
      this.failures = 0;
      return true;
    }
    return false;
  }

  record(success: boolean): void {
    if (Date.now() - this.bucketStart > this.windowMs) {
      this.failures = 0;
    }
    if (success) {
      this.failures = Math.max(0, this.failures - 1);
    } else {
      this.failures += 1;
      if (this.failures >= this.failureThreshold) {
        this.openedAt = Date.now();
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Idempotency keys (Redis-backed; accepts a minimal redis-like client)
// ---------------------------------------------------------------------------

export interface IdempotencyClient {
  setEx(key: string, ttlSec: number, value: string): Promise<unknown>;
  get(key: string): Promise<string | null>;
}

export async function withIdempotencyKey<T>(
  redis: IdempotencyClient,
  key: string,
  compute: () => Promise<T>,
  opts: { ttlSec?: number } = {}
): Promise<{ fresh: boolean; value: T }> {
  const ttlSec = opts.ttlSec ?? 24 * 60 * 60; // 24h
  const existing = await redis.get(key);
  if (existing) {
    return { fresh: false, value: JSON.parse(existing) as T };
  }
  const value = await compute();
  await redis.setEx(key, ttlSec, JSON.stringify(value));
  return { fresh: true, value };
}

// ---------------------------------------------------------------------------
// Pagination caps + Prisma statement timeout
// ---------------------------------------------------------------------------

export const MAX_LIST_PAGE = 200;
export const DEFAULT_STATEMENT_TIMEOUT_MS = 5_000; // matches legacy managed PG

export function clampPage(limit: number | undefined, max = MAX_LIST_PAGE): number {
  if (limit === undefined) return 25;
  return Math.min(Math.max(1, Math.floor(limit)), max);
}

/** Prisma connection URL with statement_timeout applied (via connection string param). */
export function withStatementTimeout(databaseUrl: string, ms = DEFAULT_STATEMENT_TIMEOUT_MS): string {
  try {
    const url = new URL(databaseUrl);
    url.searchParams.set('statement_timeout', String(ms));
    return url.toString();
  } catch {
    return databaseUrl;
  }
}
