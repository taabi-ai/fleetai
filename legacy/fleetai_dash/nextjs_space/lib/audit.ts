import { prisma } from '@/lib/db'
import { auth } from '@/auth'

/**
 * Platform-wide audit trail.
 *
 * `withAudit()` wraps a route handler: it records who did what (actor, action, entity, id), the sanitised
 * request payload, the response status and a small response excerpt. It never throws — audit failures are
 * logged to the server console and the original response is always returned.
 *
 * `audit()` records an event directly (auth events, background jobs, system actions).
 */

export type AuditInput = {
  action: string
  entity: string
  entityId?: string | null
  summary: string
  actor?: { id?: string | null; email?: string | null; role?: string | null } | null
  method?: string
  path?: string
  status?: number
  ip?: string | null
  userAgent?: string | null
  payload?: unknown
  result?: unknown
  durationMs?: number
}

const SECRET_KEY = /(password|passwd|secret|token|apikey|api_key|licensekey|license_key|authorization|authheader|pin$|^pin|credential|private)/i
const MAX_STRING = 2000

/** Deep-copies a value, redacting secret-looking keys and truncating long strings. */
export function sanitize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value
  if (depth > 6) return '[depth]'
  if (typeof value === 'string') return value.length > MAX_STRING ? value.slice(0, MAX_STRING) + `…(+${value.length - MAX_STRING})` : value
  if (typeof value !== 'object') return value
  if (Array.isArray(value)) return value.slice(0, 200).map(v => sanitize(v, depth + 1))
  const out: Record<string, unknown> = {}
  const obj = value as Record<string, unknown>
  // Env-var style payloads: { key, value, isSecret } — redact the value when flagged or key looks secret.
  const valueIsSecret = typeof obj.key === 'string' && (obj.isSecret === true || SECRET_KEY.test(obj.key))
  for (const [k, v] of Object.entries(obj)) {
    if (SECRET_KEY.test(k) || (k === 'value' && valueIsSecret)) out[k] = v === '' || v === null || v === undefined ? v : '[redacted]'
    else out[k] = sanitize(v, depth + 1)
  }
  return out
}

function clientInfo(req: Request) {
  const h = req.headers
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || null
  return { ip, userAgent: h.get('user-agent')?.slice(0, 300) ?? null }
}

export async function audit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actor?.id ?? null,
        actorEmail: input.actor?.email ?? null,
        actorRole: input.actor?.role ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        summary: input.summary.slice(0, 500),
        method: input.method,
        path: input.path,
        status: input.status,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        payload: input.payload === undefined ? undefined : (sanitize(input.payload) as object),
        result: input.result === undefined ? undefined : (sanitize(input.result) as object),
        durationMs: input.durationMs,
      },
    })
  } catch (e) {
    console.error('[audit] failed to write audit log', (e as Error)?.message)
  }
}

const VERB: Record<string, string> = { POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' }
const PAST: Record<string, string> = { create: 'created', update: 'updated', delete: 'deleted', lock: 'locked', unlock: 'unlocked', clone: 'cloned', use: 'used', share: 'shared', unshare: 'unshared', test: 'tested', connect: 'connected', verify: 'verified', signup: 'signed up', login: 'logged in', generate: 'generated', ingest: 'ingested', grant: 'granted', request: 'requested', review: 'reviewed', upload: 'uploaded', read: 'marked as read', clear: 'cleared', set: 'set', remove: 'removed' }

export type AuditMeta = {
  entity: string
  /** verb per HTTP method; falls back to create/update/delete */
  verbs?: Partial<Record<'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'GET', string>>
  /** name of the route param holding the entity id (defaults to the last param) */
  idParam?: string
}

type Ctx = { params: Promise<Record<string, string>> } | undefined
type Handler = (req: Request, ctx?: any) => Promise<Response> | Response

function pickLabel(body: any): string | null {
  if (!body || typeof body !== 'object') return null
  for (const k of ['title', 'name', 'label', 'email', 'key', 'type', 'slug']) {
    const v = body[k]
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 80)
  }
  return null
}

/** Wraps a Next.js route handler so every invocation is written to the audit log. */
export function withAudit<H extends Handler>(handler: H, meta: AuditMeta): H {
  const wrapped = async (req: Request, ctx?: Ctx) => {
    const started = Date.now()
    const method = req.method.toUpperCase()
    const verb = meta.verbs?.[method as 'POST'] ?? VERB[method] ?? method.toLowerCase()

    let body: unknown = undefined
    try {
      const ct = req.headers.get('content-type') ?? ''
      if (ct.includes('application/json')) body = await req.clone().json()
    } catch { body = undefined }

    let res: Response
    let thrown: unknown = null
    try {
      res = await handler(req, ctx)
    } catch (e) {
      thrown = e
      res = new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }

    // Audit asynchronously so the response is not delayed.
    void (async () => {
      try {
        const params = ctx?.params ? await ctx.params : {}
        const paramKeys = Object.keys(params)
        const idKey = meta.idParam ?? paramKeys[paramKeys.length - 1]
        let entityId: string | null = idKey ? params[idKey] ?? null : null
        let result: unknown = undefined
        const ct = res.headers.get('content-type') ?? ''
        if (ct.includes('application/json')) {
          try {
            const text = await res.clone().text()
            if (text.length < 20_000) {
              const json = JSON.parse(text)
              if (!entityId && json && typeof json === 'object' && typeof json.id === 'string') entityId = json.id
              result = res.ok
                ? (json && typeof json === 'object' && !Array.isArray(json)
                  ? Object.fromEntries(Object.entries(json).filter(([k]) => ['id', 'name', 'title', 'email', 'role', 'status', 'isPublished', 'enabled', 'count', 'ok', 'message'].includes(k)))
                  : undefined)
                : json
            }
          } catch { /* not json */ }
        }
        const session = await auth().catch(() => null)
        const actor = session?.user
          ? { id: session.user.id, email: session.user.email, role: (session.user as { role?: string }).role }
          : { id: null, email: req.headers.get('x-dora-token') ? 'webhook' : null, role: null }
        const label = pickLabel(body)
        const who = actor.email ?? 'anonymous'
        const outcome = res.ok ? (PAST[verb] ?? verb) : `failed to ${verb} (HTTP ${res.status})`
        const summary = `${who} ${outcome} ${meta.entity}${label ? ` "${label}"` : ''}${entityId ? ` [${entityId}]` : ''}`
        const url = new URL(req.url)
        await audit({
          action: `${meta.entity}.${verb}`,
          entity: meta.entity,
          entityId,
          summary,
          actor,
          method,
          path: url.pathname,
          status: res.status,
          ...clientInfo(req),
          payload: body,
          result: thrown ? { error: String((thrown as Error)?.message ?? thrown) } : result,
          durationMs: Date.now() - started,
        })
      } catch (e) {
        console.error('[audit] wrapper error', (e as Error)?.message)
      }
    })()

    if (thrown) {
      console.error(`[${meta.entity}] handler threw`, thrown)
    }
    return res
  }
  return wrapped as unknown as H
}
