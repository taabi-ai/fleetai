import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildGateway, loadConfig, type GatewayConfig } from '../src/main';
import type { FastifyInstance } from 'fastify';

describe('gateway', () => {
  let server: FastifyInstance;
  let upstream: FastifyInstance;

  beforeAll(async () => {
    const { default: Fastify } = await import('fastify');
    const legacy = Fastify({ logger: false });
    legacy.all('/*', async (_req, reply) => reply.send({ source: 'legacy', ok: true }));
    upstream = legacy;
    await upstream.listen({ port: 0, host: '127.0.0.1' });
    const { port } = upstream.server.address() as { port: number };

    const config: GatewayConfig = loadConfig({});
    config.legacyUrl = `http://127.0.0.1:${port}`;
    config.port = 0;
    server = buildGateway(config);
    await server.listen({ port: 0, host: '127.0.0.1' });
  });

  afterAll(async () => {
    await server?.close();
    await upstream?.close();
  });

  it('proxies /api/health from the gateway with legacy status', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.gateway).toBe('up');
    expect(body.checks.legacy).toBe('up');
  });

  it('routes unknown /api paths to the legacy monolith (flag=legacy)', async () => {
    const res = await server.inject({ method: 'POST', url: '/api/dashboard', payload: { title: 'x' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().source).toBe('legacy');
  });

  it('returns 404 for non-API paths', async () => {
    const res = await server.inject({ method: 'GET', url: '/hello' });
    expect(res.statusCode).toBe(404);
  });
});
