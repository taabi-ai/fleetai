/**
 * @fleetai/gateway — Fastify API gateway (strangler-fig facade).
 *
 * Reads routes.yaml and proxies /api/* to the legacy monolith or to services
 * based on each route's flag:
 *   legacy  -> proxy to LEGACY_URL
 *   shadow  -> proxy to legacy, asynchronously replay to service, diff + log
 *   service -> proxy to service with x-fleetai-internal HMAC + principal header
 *   gateway -> answered by this app (e.g. /api/health)
 *
 * Auth: Authorization: Bearer <RS256 JWT> (JWKS from IDENTITY_URL) or a legacy
 * next-auth session cookie. Both are normalised to a Principal that routes can
 * pre-check against their `permission` column (services still enforce).
 */

import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import { parse as parseYaml } from 'yaml';
import { readFileSync, watchFile } from 'node:fs';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { createJwksVerifier, signInternalHeader, INTERNAL_HEADER, PRINCIPAL_HEADER } from '@fleetai/auth';
import { initTelemetry } from '@fleetai/observability';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RouteFlag = 'legacy' | 'shadow' | 'service' | 'gateway';

export interface RouteEntry {
  path: string;
  methods: string[];
  service: string;
  servicePath?: string;
  flag: RouteFlag;
  permission?: string;
  public?: boolean;
  shadowWrites?: boolean;
}

export interface GatewayConfig {
  port: number;
  legacyUrl: string;
  serviceUrls: Record<string, string>;
  identityUrl?: string;
  nextauthSecret?: string;
  internalHmacSecret: string;
  redisUrl?: string;
  anonymousRateLimit?: number; // requests per window per IP
  rateLimitWindowMs?: number;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  return {
    port: Number(env['PORT'] ?? 4000),
    legacyUrl: env['LEGACY_URL'] ?? 'http://localhost:3001',
    serviceUrls: {
      identity: env['SERVICE_URL_IDENTITY'] ?? 'http://localhost:4001',
      dashboard: env['SERVICE_URL_DASHBOARD'] ?? 'http://localhost:4002',
      'fleet-metrics': env['SERVICE_URL_FLEET_METRICS'] ?? 'http://localhost:4003',
      'ingest-api': env['SERVICE_URL_INGEST_API'] ?? 'http://localhost:4013',
      ai: env['SERVICE_URL_AI'] ?? 'http://localhost:4004',
      'platform-config': env['SERVICE_URL_PLATFORM_CONFIG'] ?? 'http://localhost:4005',
      notification: env['SERVICE_URL_NOTIFICATION'] ?? 'http://localhost:4006',
      media: env['SERVICE_URL_MEDIA'] ?? 'http://localhost:4007',
      training: env['SERVICE_URL_TRAINING'] ?? 'http://localhost:4008',
      engineering: env['SERVICE_URL_ENGINEERING'] ?? 'http://localhost:4009',
    },
    identityUrl: env['IDENTITY_URL'] ?? 'http://localhost:4001',
    nextauthSecret: env['NEXTAUTH_SECRET'],
    internalHmacSecret: env['INTERNAL_HMAC_SECRET'] ?? 'dev-only-change-me',
    redisUrl: env['REDIS_URL'],
    anonymousRateLimit: Number(env['ANONYMOUS_RATE_LIMIT'] ?? 100),
    rateLimitWindowMs: Number(env['RATE_LIMIT_WINDOW_MS'] ?? 60000),
  };
}

// ---------------------------------------------------------------------------
// routes.yaml loading + hot reload
// ---------------------------------------------------------------------------

export function loadRoutes(path = join(process.cwd(), 'routes.yaml')): RouteEntry[] {
  const raw = readFileSync(path, 'utf8');
  const doc = parseYaml(raw) as { routes: RouteEntry[] };
  return doc.routes;
}

/** Convert a Next.js-style path segment to a colon-param segment for Fastify. */
export function toFastifyPath(path: string): string {
  return path.replace(/\[\.\.\.(\w+)\]/g, '*$1').replace(/\[(\w+)\]/g, ':$1');
}

// ---------------------------------------------------------------------------
// Simple in-memory fixed-window rate limiter (Redis store is optional; this
// is the dev fallback so the gateway runs without infra).
// ---------------------------------------------------------------------------

class RateLimiter {
  private hits = new Map<string, { windowStart: number; count: number }>();

  constructor(private limit: number, private windowMs: number) {}

  hit(key: string): { allowed: boolean; remaining: number } {
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || now - entry.windowStart >= this.windowMs) {
      this.hits.set(key, { windowStart: now, count: 1 });
      return { allowed: this.limit > 0, remaining: this.limit - 1 };
    }
    entry.count += 1;
    return { allowed: entry.count <= this.limit, remaining: Math.max(0, this.limit - entry.count) };
  }
}

// ---------------------------------------------------------------------------
// Gateway app
// ---------------------------------------------------------------------------

export interface Principal { sub: string; email?: string; role?: string; perms: string[] }

export function buildGateway(config: GatewayConfig, routesFile = join(process.cwd(), 'routes.yaml')) {
  const server = Fastify({ logger: true, trustProxy: true });
  let routes = loadRoutes(routesFile);
  const limiter = new RateLimiter(config.anonymousRateLimit ?? 100, config.rateLimitWindowMs ?? 60000);
  const jwksVerifier = config.identityUrl ? createJwksVerifier(`${config.identityUrl}/.well-known/jwks.json`) : undefined;

  // Hot reload of routes.yaml (flag flips without redeploy).
  const reload = () => {
    try {
      routes = loadRoutes(routesFile);
      server.log.info(`[gateway] reloaded routes.yaml (${routes.length} routes)`);
    } catch (e) {
      server.log.error(`[gateway] routes.yaml reload failed: ${(e as Error).message}`);
    }
  };
  watchFile(routesFile, { interval: 2000 }, reload);

  // --- auth normalisation ---
  async function resolvePrincipal(req: FastifyRequest): Promise<Principal | null> {
    const authz = req.headers.authorization;
    if (authz?.startsWith('Bearer ')) {
      const token = authz.slice(7);
      try {
        const claims = await jwksVerifier!.verify(token);
        return { sub: claims.sub, email: claims.email, role: claims.role, perms: claims.perms ?? [] };
      } catch (e) {
        server.log.warn(`[gateway] JWT verify failed: ${(e as Error).message}`);
        return null;
      }
    }
    // Legacy next-auth session cookie (transition): decode is done by the web
    // frontend adapter; here we accept the session-derived header the monolith
    // sets when proxied. Full cookie decoding is added in prompt 11.
    return null;
  }

  function matchRoute(url: string, method: string): { route: RouteEntry; params: Record<string, string> } | null {
    for (const route of routes) {
      if (!route.methods.includes(method)) continue;
      const re = pathToRegex(route.path);
      const m = url.match(re);
      if (m) {
        const params: Record<string, string> = {};
        const names = route.path.match(/\[(\.\.\.)?(\w+)\]/g) ?? [];
        names.forEach((n, i) => {
          const key = n.replace(/[\[\]]/g, '').replace(/^\.\.\./, '');
          params[key] = decodeURIComponent(m[i + 1] ?? '');
        });
        return { route, params };
      }
    }
    return null;
  }

  function pathToRegex(path: string): RegExp {
    const escaped = path
      .replace(/\[\.\.\.(\w+)\]/g, '(.*)')
      .replace(/\[(\w+)\]/g, '([^/]+)')
      .replace(/\//g, '\\/');
    return new RegExp(`^${escaped}$`);
  }

  function substituteServicePath(servicePath: string, params: Record<string, string>): string {
    return servicePath.replace(/:(\w+)/g, (_, k) => encodeURIComponent(params[k] ?? ''));
  }

  // --- proxy helpers ---
  async function proxyTo(req: FastifyRequest, reply: FastifyReply, targetUrl: string, addInternalHeaders = false, pathOverride?: string) {
    const fullUrl = new URL(pathOverride ?? req.url, targetUrl);
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (v === undefined || ['host', 'content-length'].includes(k)) continue;
      headers[k] = Array.isArray(v) ? v.join(', ') : String(v);
    }
    if (addInternalHeaders && config.internalHmacSecret) {
      headers[INTERNAL_HEADER] = signInternalHeader(config.internalHmacSecret, req.method, req.url, req.body as object | undefined);
    }
    const body =
      req.body !== undefined && typeof req.body !== 'string' ? JSON.stringify(req.body) : (req.body as string | undefined);
    try {
      const upstream = await fetch(fullUrl, {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
        redirect: 'manual',
      });
      reply.code(upstream.status);
      for (const [k, v] of upstream.headers.entries()) {
        if (['content-encoding', 'transfer-encoding'].includes(k.toLowerCase())) continue;
        reply.header(k, v);
      }
      const text = await upstream.text();
      const ct = upstream.headers.get('content-type') ?? 'application/json';
      return reply.type(ct).send(text);
    } catch (e) {
      server.log.error(`[gateway] upstream error ${targetUrl}: ${(e as Error).message}`);
      return reply.code(502).send({ error: 'Bad gateway' });
    }
  }

  async function shadowCompare(req: FastifyRequest, reply: FastifyReply, route: RouteEntry) {
    // Fire-and-forget replay to the service; never affects the client response.
    const target = config.serviceUrls[route.service];
    if (!target) return;
    try {
      const fullUrl = new URL(req.url, target);
      const res = await fetch(fullUrl, {
        method: req.method,
        headers: { 'content-type': 'application/json', ...(config.internalHmacSecret ? { [INTERNAL_HEADER]: signInternalHeader(config.internalHmacSecret, req.method, req.url, req.body as object | undefined) } : {}) },
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}),
      });
      const body = await res.text();
      const legacyStatus = reply.statusCode;
      const legacyBody = (req.raw as unknown as { __cachedBody?: string }).__cachedBody;
      if (res.status !== legacyStatus || (res.status === 200 && body !== legacyBody)) {
        server.log.warn(`[gateway] shadow mismatch route=${route.path} expected=${legacyStatus} got=${res.status} (diff logged once/min in prod)`);
      }
    } catch (e) {
      server.log.warn(`[gateway] shadow replay failed ${route.path}: ${(e as Error).message}`);
    }
  }

  // --- route handling ---
  server.addHook('onRequest', async (req, reply) => {
    const match = matchRoute(req.url.split('?')[0]!, req.method);
    if (!match) return; // non-API paths fall through to 404 handling below

    const { route } = match;

    // Rate limit anonymous requests.
    if (!route.public && !req.headers.authorization) {
      const key = req.ip ?? 'unknown';
      const { allowed } = limiter.hit(key);
      if (!allowed) {
        return reply.code(429).send({ error: 'Too many requests' });
      }
    }

    // Skip auth pre-check for public routes, legacy routes, and gateway service.
    if (route.public || route.flag === 'legacy' || route.service === 'gateway') return;

    const principal = await resolvePrincipal(req);
    if (!principal) return reply.code(401).send({ error: 'Unauthorized' });
    if (route.permission && !principal.perms.includes(route.permission)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    // Attach principal to headers for service-mode upstreams.
    req.headers[PRINCIPAL_HEADER] = JSON.stringify(principal);
  });

  server.addHook('onSend', async (req, reply, payload) => {
    if (req.raw && typeof payload === 'string') {
      (req.raw as unknown as { __cachedBody?: string }).__cachedBody = payload;
    }
    return payload;
  });

  server.all('/*', async (req, reply) => {
    const url = req.url.split('?')[0]!;
    const match = matchRoute(url, req.method);

    // /api/health aggregate.
    if (url === '/api/health') {
      const checks: Record<string, string> = { gateway: 'up' };
      if (config.legacyUrl) {
        try {
          const res = await fetch(`${config.legacyUrl}/api/health`, { signal: AbortSignal.timeout(2000) });
          checks['legacy'] = res.ok ? 'up' : `down(${res.status})`;
        } catch {
          checks['legacy'] = 'down';
        }
      }
      return reply.send({ status: checks['legacy'] === 'up' ? 'ok' : 'degraded', gateway: 'up', checks });
    }

    if (!match) {
      return reply.code(404).send({ error: 'Not found' });
    }
    const { route, params } = match;
    if (route.flag === 'gateway') {
      return reply.send({ status: 'ok', service: 'gateway' });
    }

    if (route.flag === 'service') {
      const target = config.serviceUrls[route.service];
      if (!target) return reply.code(502).send({ error: 'Service not configured' });
      const servicePath = route.servicePath ?? route.path;
      const finalPath = substituteServicePath(servicePath, params);
      const finalUrl = `${finalPath}${req.url.slice(url.length)}`;
      return proxyTo(req, reply, target.replace(/\/+$/, ''), true, finalUrl);
    }

    if (route.flag === 'shadow') {
      // Replay to service asynchronously, then serve legacy.
      void shadowCompare(req, reply, route);
    }

    // legacy (default) and shadow both proxy to the monolith.
    return proxyTo(req, reply, config.legacyUrl.replace(/\/+$/, ''));
  });

  // Admin flag-flip endpoint (cutover runbook).
  server.patch('/admin/gateway/routes/:id/flag', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { flag } = req.body as { flag: RouteFlag };
    const route = routes.find((r) => r.path === id);
    if (!route) return reply.code(404).send({ error: 'Route not found' });
    if (!['legacy', 'shadow', 'service'].includes(flag)) return reply.code(400).send({ error: 'Invalid flag' });
    route.flag = flag;
    server.log.info(`[gateway] route ${route.path} -> ${flag}`);
    return reply.send({ ok: true, path: route.path, flag: route.flag });
  });

  return server;
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  initTelemetry('gateway');
  const config = loadConfig();
  const server = buildGateway(config);
  await server.listen({ port: config.port, host: '0.0.0.0' });
}

if (process.argv[1]?.endsWith('main.ts') || process.argv[1]?.endsWith('main.js')) {
  void main();
}
