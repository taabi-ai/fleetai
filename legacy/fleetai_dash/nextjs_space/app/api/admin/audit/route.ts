export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/admin'
import type { Prisma } from '@prisma/client'

const PAGE_SIZE = 50

export async function GET(request: Request) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const url = new URL(request.url)
  const sp = url.searchParams
  const q = (sp.get('q') ?? '').trim()
  const action = sp.get('action') ?? ''
  const entity = sp.get('entity') ?? ''
  const actor = (sp.get('actor') ?? '').trim()
  const status = sp.get('status') ?? ''
  const from = sp.get('from')
  const to = sp.get('to')
  const page = Math.max(1, Number(sp.get('page') ?? 1) || 1)
  const pageSize = Math.min(200, Math.max(10, Number(sp.get('pageSize') ?? PAGE_SIZE) || PAGE_SIZE))
  const format = sp.get('format')

  const where: Prisma.AuditLogWhereInput = {}
  if (action) where.action = action
  if (entity) where.entity = entity
  if (actor) where.OR = [{ actorEmail: { contains: actor, mode: 'insensitive' } }, { actorId: actor }]
  if (status === 'ok') where.status = { lt: 400 }
  if (status === 'error') where.status = { gte: 400 }
  if (from || to) where.createdAt = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) }
  if (q) {
    const qOr: Prisma.AuditLogWhereInput[] = [
      { summary: { contains: q, mode: 'insensitive' } },
      { path: { contains: q, mode: 'insensitive' } },
      { entityId: q },
      { actorEmail: { contains: q, mode: 'insensitive' } },
    ]
    where.AND = [{ OR: qOr }]
  }

  if (format === 'csv') {
    const rows = await prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 5000 })
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = ['time,actor,role,action,entity,entityId,summary,method,path,status,ip,durationMs']
    for (const r of rows) {
      lines.push([r.createdAt.toISOString(), r.actorEmail, r.actorRole, r.action, r.entity, r.entityId, r.summary, r.method, r.path, r.status, r.ip, r.durationMs].map(esc).join(','))
    }
    return new NextResponse(lines.join('\n'), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"` },
    })
  }

  const [total, items, actions, entities, stats] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
    prisma.auditLog.findMany({ distinct: ['entity'], select: { entity: true }, orderBy: { entity: 'asc' } }),
    Promise.all([
      prisma.auditLog.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } } }),
      prisma.auditLog.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) }, status: { gte: 400 } } }),
      prisma.auditLog.count(),
    ]),
  ])

  return NextResponse.json({
    items, total, page, pageSize,
    actions: actions.map(a => a.action),
    entities: entities.map(e => e.entity),
    stats: { last24h: stats[0], errors24h: stats[1], all: stats[2] },
  })
}
