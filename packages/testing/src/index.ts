/**
 * @fleetai/testing — Deterministic PRNG, fixtures and stub helpers.
 *
 * The migration pack forbids Math.random() in production paths. Tests use the
 * deterministic mulberry32 PRNG (seed 20260907, matches legacy seed-fleet.ts).
 */

/** mulberry32 — deterministic PRNG (same seed → same sequence). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SEED = 20260907;

export function rng(): () => number {
  return mulberry32(SEED);
}

/** Integer in [min, max] inclusive from a deterministic rng. */
export function intBetween(rnd: () => number, min: number, max: number): number {
  return Math.floor(rnd() * (max - min + 1)) + min;
}

/** Pick a deterministic item from an array. */
export function pick<T>(rnd: () => number, arr: readonly T[]): T {
  const idx = Math.floor(rnd() * arr.length);
  const item = arr[idx];
  if (item === undefined) throw new Error('pick: empty array');
  return item;
}

// ---------------------------------------------------------------------------
// Stub HTTP server for tests (bare Node http, no extra deps)
// ---------------------------------------------------------------------------

import { createServer, IncomingMessage, ServerResponse, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface StubHandler {
  status: number;
  body: unknown;
}

export class StubServer {
  readonly server: HttpServer;
  requests: { method: string; url: string; body: string }[] = [];
  private handlers: Array<(method: string, url: string, body: string) => { status: number; body: unknown } | undefined> = [];

  constructor() {
    this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        this.requests.push({ method: req.method ?? 'GET', url: req.url ?? '/', body });
        let handled: { status: number; body: unknown } | undefined;
        for (const h of this.handlers) {
          handled = h(req.method ?? 'GET', req.url ?? '/', body);
          if (handled) break;
        }
        const { status, body: resBody } = handled ?? { status: 200, body: { ok: true } };
        res.statusCode = status;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(resBody));
      });
    });
  }

  /** Register a matcher handler. First matching handler wins. */
  when(match: (method: string, url: string) => boolean, respond: (body: string) => { status: number; body: unknown }): void {
    this.handlers.push((method, url, body) => (match(method, url) ? respond(body) : undefined));
  }

  async start(): Promise<{ port: number; baseUrl: string }> {
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    const { port } = this.server.address() as AddressInfo;
    return { port, baseUrl: `http://127.0.0.1:${port}` };
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => this.server.close((e) => (e ? reject(e) : resolve())));
  }

  lastRequest(): { method: string; url: string; body: string } | undefined {
    return this.requests[this.requests.length - 1];
  }
}

// ---------------------------------------------------------------------------
// Fake OpenAI-compatible LLM server (for ai-service tests — never real providers)
// ---------------------------------------------------------------------------

export function startFakeLlm(opts: { completions?: string[]; fail?: boolean } = {}) {
  const server = new StubServer();
  const completions = opts.completions ?? ['{"type":"kpi_card","title":"Test","dataSource":"fleet","metric":"active_vehicles"}'];
  server.when((method, url) => method === 'POST' && url.includes('/chat/completions'), () => {
    if (opts.fail) return { status: 429, body: { error: { message: 'rate limit (test)' } } };
    const content = completions[Math.min(completions.length - 1, server.requests.length)] ?? completions[0];
    return {
      status: 200,
      body: {
        choices: [{ message: { content } }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      },
    };
  });
  return server;
}
