export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/db'
import { getIntegration } from '@/lib/integrations'
import { requirePermission } from '@/lib/rbac'
import { DORA_EVENT_TYPES, computeDoraMetrics, rateBand } from '@/lib/dora'
import { withAudit } from '@/lib/audit'

function tokenMatches(a: string, b: string) {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

/** Ingest a deployment / incident event from CI/CD or monitoring (header: x-dora-token). */
async function _POST(request: Request) {
  const cfg = await getIntegration('dora_webhook')
  if (!cfg?.enabled || !cfg.config.token) return NextResponse.json({ error: 'DORA webhook is not enabled. Configure it in Admin → Integrations.' }, { status: 503 })
  const provided = request.headers.get('x-dora-token') ?? ''
  if (!provided || !tokenMatches(provided, cfg.config.token)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body || !(DORA_EVENT_TYPES as readonly string[]).includes(body.type)) {
    return NextResponse.json({ error: `type must be one of ${DORA_EVENT_TYPES.join(', ')}` }, { status: 400 })
  }
  const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date()
  if (Number.isNaN(occurredAt.getTime())) return NextResponse.json({ error: 'occurredAt must be an ISO date' }, { status: 400 })
  if (body.type !== 'deployment' && !body.incidentId) return NextResponse.json({ error: 'incidentId is required for incident events' }, { status: 400 })

  const event = await prisma.doraEvent.create({
    data: {
      type: body.type,
      service: typeof body.service === 'string' && body.service ? body.service.slice(0, 80) : 'fleetai-dash',
      env: typeof body.env === 'string' && body.env ? body.env.slice(0, 40) : 'production',
      status: body.status === 'failed' ? 'failed' : 'success',
      ref: typeof body.ref === 'string' ? body.ref.slice(0, 120) : null,
      incidentId: typeof body.incidentId === 'string' ? body.incidentId.slice(0, 120) : null,
      leadTimeMin: Number.isFinite(Number(body.leadTimeMin)) ? Math.max(0, Math.round(Number(body.leadTimeMin))) : null,
      occurredAt,
      meta: body.meta && typeof body.meta === 'object' ? body.meta : undefined,
    },
  })
  return NextResponse.json({ ok: true, id: event.id }, { status: 201 })
}

/** Metrics + recent events for users holding dora.view. */
export async function GET(request: Request) {
  if (!(await requirePermission('dora.view'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const url = new URL(request.url)
  const windowDays = Math.min(365, Math.max(7, Number(url.searchParams.get('days')) || 30))
  const service = url.searchParams.get('service') || undefined
  const [metrics, recent, total, plane, jira, webhook] = await Promise.all([
    computeDoraMetrics(windowDays, service),
    prisma.doraEvent.findMany({ where: service ? { service } : undefined, orderBy: { occurredAt: 'desc' }, take: 50 }),
    prisma.doraEvent.count(),
    getIntegration('plane'),
    getIntegration('jira'),
    getIntegration('dora_webhook'),
  ])
  return NextResponse.json({
    metrics,
    bands: rateBand(metrics),
    recent,
    total,
    sources: {
      webhook: { configured: !!webhook?.config.token, enabled: !!webhook?.enabled },
      plane: { configured: !!plane?.config.apiKey, enabled: !!plane?.enabled, baseUrl: plane?.config.baseUrl ?? null, workspace: plane?.config.workspaceSlug ?? null },
      jira: { configured: !!jira?.config.apiToken, enabled: !!jira?.enabled, baseUrl: jira?.config.baseUrl ?? null },
    },
  })
}

export const POST = withAudit(_POST, { entity: 'dora_event', verbs: { POST: 'ingest' } })
