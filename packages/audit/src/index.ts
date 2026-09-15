/**
 * @fleetai/audit — Audit trail decorator.
 *
 * Ports the legacy `withAudit()` semantics: every mutating endpoint is audited;
 * the record is published as `audit.entry.recorded` via the outbox. Never throws;
 * audit failures must never break the business response.
 */

import { AuditEntryRecorded, createEnvelope, EventEnvelope } from '@fleetai/events';
import { publishInTx } from '@fleetai/outbox';

export type AuditInput = {
  action: string;
  entity: string;
  entityId?: string | null;
  summary: string;
  actor?: { id?: string | null; email?: string | null; role?: string | null } | null;
  method?: string;
  path?: string;
  status?: number;
  ip?: string | null;
  userAgent?: string | null;
  payload?: unknown;
  result?: unknown;
  durationMs?: number;
};

const SECRET_KEY = /(password|passwd|secret|token|apikey|api_key|licensekey|license_key|authorization|authheader|pin$|^pin|credential|private)/i;
const MAX_STRING = 2000;

/** Deep-copies a value, redacting secret-looking keys and truncating long strings. (ported from legacy lib/audit.ts) */
export function sanitize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 6) return '[depth]';
  if (typeof value === 'string') return value.length > MAX_STRING ? value.slice(0, MAX_STRING) + `…(+${value.length - MAX_STRING})` : value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 200).map((v) => sanitize(v, depth + 1));
  const out: Record<string, unknown> = {};
  const obj = value as Record<string, unknown>;
  const valueIsSecret = typeof obj['key'] === 'string' && (obj['isSecret'] === true || SECRET_KEY.test(obj['key']));
  for (const [k, v] of Object.entries(obj)) {
    if (SECRET_KEY.test(k) || (k === 'value' && valueIsSecret)) out[k] = v === '' || v === null || v === undefined ? v : '[redacted]';
    else out[k] = sanitize(v, depth + 1);
  }
  return out;
}

export interface AuditPublisher {
  /** Publish an audit record (via outbox or direct). */
  publish(input: AuditInput, opts: { producer: string; tx?: unknown }): Promise<void>;
}

/**
 * Default publisher that builds an `audit.entry.recorded` envelope and calls
 * `publishInTx` when a transaction is supplied, otherwise delivers via a
 * provided `send` callback (used by services without outbox yet).
 */
export function createAuditPublisher(producer: string, send?: (envelope: EventEnvelope<unknown>) => Promise<void>): AuditPublisher {
  return {
    async publish(input, opts) {
      const envelope = createEnvelope(
        AuditEntryRecorded,
        {
          entity: input.entity,
          entityId: input.entityId ?? undefined,
          verb: input.action.split('.').pop() ?? 'update',
          actorUserId: input.actor?.id ?? undefined,
          actorRole: input.actor?.role ?? undefined,
          ip: input.ip ?? undefined,
          metadata: sanitize({
            summary: input.summary,
            method: input.method,
            path: input.path,
            status: input.status,
            payload: input.payload,
            result: input.result,
            durationMs: input.durationMs,
          }) as Record<string, unknown>,
          occurredAt: new Date().toISOString(),
        },
        { producer }
      ) as unknown as EventEnvelope<unknown>;
      if (opts.tx) {
        await publishInTx(opts.tx as never, envelope as never);
      } else if (send) {
        await send(envelope);
      }
    },
  };
}

export type AuditMeta = {
  entity: string;
  /** verb per HTTP method */
  verbs?: Partial<Record<'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'GET', string>>;
  /** route param holding the entity id */
  idParam?: string;
};

export type Handler = (req: Request, ctx?: { params?: unknown }) => Promise<Response> | Response;

export function withAudit<H extends Handler>(handler: H, meta: AuditMeta, publisher: AuditPublisher, producer: string): H {
  const VERB: Record<string, string> = { POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' };
  const wrapped = async (req: Request, ctx?: { params?: unknown }) => {
    const started = Date.now();
    const method = req.method.toUpperCase();
    const verb = meta.verbs?.[method as 'POST'] ?? VERB[method] ?? method.toLowerCase();

    let body: unknown = undefined;
    try {
      const ct = req.headers.get('content-type') ?? '';
      if (ct.includes('application/json')) body = await req.clone().json();
    } catch {
      body = undefined;
    }

    let res: Response;
    let thrown: unknown = null;
    try {
      res = await handler(req, ctx);
    } catch (e) {
      thrown = e;
      res = new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    void (async () => {
      try {
        const params = (ctx?.params as Record<string, string> | undefined) ?? {};
        const paramKeys = Object.keys(params);
        const idKey = meta.idParam ?? paramKeys[paramKeys.length - 1];
        let entityId: string | null = idKey ? params[idKey] ?? null : null;
        let result: unknown = undefined;
        const ct = res.headers.get('content-type') ?? '';
        if (ct.includes('application/json')) {
          try {
            const text = await res.clone().text();
            if (text.length < 20_000) {
              const json = JSON.parse(text);
              if (!entityId && json && typeof json === 'object' && typeof json.id === 'string') entityId = json.id;
              result = res.ok
                ? json && typeof json === 'object' && !Array.isArray(json)
                  ? Object.fromEntries(Object.entries(json).filter(([k]) => ['id', 'name', 'title', 'email', 'role', 'status', 'isPublished', 'enabled', 'count', 'ok', 'message'].includes(k)))
                  : undefined
                : json;
            }
          } catch {
            /* not json */
          }
        }
        const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
        const summary = `${meta.entity}.${verb}`;
        await publisher.publish(
          {
            action: `${meta.entity}.${verb}`,
            entity: meta.entity,
            entityId,
            summary,
            method,
            path: new URL(req.url).pathname,
            status: res.status,
            ip,
            userAgent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
            payload: body,
            result: thrown ? { error: String((thrown as Error)?.message ?? thrown) } : result,
            durationMs: Date.now() - started,
          },
          { producer }
        );
      } catch (e) {
        // audit must never break the response
        console.error('[audit] wrapper error', (e as Error)?.message);
      }
    })();

    return res;
  };
  return wrapped as unknown as H;
}
