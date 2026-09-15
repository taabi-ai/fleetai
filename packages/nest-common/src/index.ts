/**
 * @fleetai/nest-common — Base module for every service:
 * health endpoints, config wiring, global error handling, graceful shutdown,
 * resilience helpers (timeouts/retries/circuit breaker/idempotency/pagination).
 */

import type { ErrorResponse } from '@fleetai/contracts';

export * from './resilience';

// ---------------------------------------------------------------------------
// bootstrapService — minimal, framework-free bootstrap.
//
// Services using NestJS wire their AppModule through this; the intent here is to
// provide a stable contract (health endpoints + error shape) that every service
// follows. Full Nest wiring lives in the service itself (Nest is an app-level
// concern, not a shared-lib concern).
// ---------------------------------------------------------------------------

export interface BootstrapOptions {
  name: string;
  port: number;
  version?: string;
  /** Async readiness probes: each returns null when healthy or an error string. */
  readinessChecks?: Array<() => Promise<string | null>>;
}

export interface HealthPayload {
  status: 'ok' | 'degraded';
  checks: Record<string, 'up' | 'down'>;
  version?: string;
}

export function healthPayload(checks: Record<string, `up` | `down`>, version?: string): HealthPayload {
  const status = Object.values(checks).every((c) => c === 'up') ? 'ok' : 'degraded';
  return { status, checks, version };
}

/** Builds a standard RFC 9457 error response body. */
export function errorResponse(status: number, title: string, detail?: string, traceId?: string): ErrorResponse {
  return {
    type: 'about:blank',
    title,
    status,
    detail,
    traceId,
  };
}

export interface HttpServerLike {
  get(path: string, handler: (req: unknown, res: unknown) => void): void;
  listen(port: number): Promise<unknown>;
  close(): Promise<unknown>;
}

/**
 * Adds /health/live and /health/ready to any Fastify-like server.
 * Live: always 200 once the process is up. Ready: 200 only when all
 * readinessChecks pass, 503 otherwise.
 */
export function wireHealth(server: HttpServerLike, opts: BootstrapOptions): void {
  type ResLike = { code?: (n: number) => unknown; send: (b: unknown) => void; type?: (t: string) => unknown };
  server.get('/health/live', (_req, res) => {
    const r = res as ResLike;
    r.type?.('application/json');
    r.send({ status: 'ok' });
  });

  server.get('/health/ready', async (_req, res) => {
    const checks: Record<string, 'up' | 'down'> = {};
    for (const [i, check] of (opts.readinessChecks ?? []).entries()) {
      const name = check.name || `check-${i}`;
      try {
        const err = await check();
        checks[name] = err === null ? 'up' : 'down';
      } catch {
        checks[name] = 'down';
      }
    }
    const payload = healthPayload(checks, opts.version);
    const r = res as { code?: (n: number) => unknown; send: (b: unknown) => void; type?: (t: string) => unknown };
    r.type?.('application/json');
    r.code?.(payload.status === 'ok' ? 200 : 503);
    r.send(payload);
  });
}

export function gracefulShutdown(server: HttpServerLike, signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT']): void {
  const shutdown = () => {
    console.log('[bootstrap] graceful shutdown');
    void server
      .close()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  };
  for (const sig of signals) process.once(sig, shutdown);
}

// ---------------------------------------------------------------------------
// Basic health indicators (framework-agnostic, callable as readinessChecks)
// ---------------------------------------------------------------------------

export function prismaHealthIndicator(prisma: { $queryRaw: (q: string) => Promise<unknown> }) {
  return async (): Promise<string | null> => {
    try {
      await prisma.$queryRaw('SELECT 1');
      return null;
    } catch {
      return 'database unreachable';
    }
  };
}

export function httpHealthIndicator(probing: () => Promise<void>) {
  return async (): Promise<string | null> => {
    try {
      await probing();
      return null;
    } catch {
      return 'dependency unreachable';
    }
  };
}
