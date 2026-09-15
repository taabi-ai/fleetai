export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/admin'
import { withAudit } from '@/lib/audit'
import { currentMonth, getPlatformDefaults, monthStart, setPlatformDefaults } from '@/lib/usage'

/** Token consumption matrix: one row per platform user for the current month + 30-day daily series. */
export async function GET() {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const month = currentMonth()
  const since = monthStart()
  const days30 = new Date(Date.now() - 30 * 24 * 3600 * 1000)

  const [defaults, users, quotas, monthAgg, allAgg, lastUsed, pending, daily, byModel] = await Promise.all([
    getPlatformDefaults(),
    prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, isActive: true }, orderBy: { createdAt: 'asc' } }),
    prisma.userQuota.findMany(),
    prisma.llmUsage.groupBy({ by: ['userId'], where: { createdAt: { gte: since } }, _sum: { totalTokens: true, promptTokens: true, completionTokens: true }, _count: { _all: true } }),
    prisma.llmUsage.groupBy({ by: ['userId'], _sum: { totalTokens: true }, _count: { _all: true } }),
    prisma.llmUsage.groupBy({ by: ['userId'], _max: { createdAt: true } }),
    prisma.creditRequest.count({ where: { status: 'pending' } }),
    prisma.$queryRaw<{ day: Date; tokens: bigint; requests: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day, SUM("totalTokens")::bigint AS tokens, COUNT(*)::bigint AS requests
      FROM "LlmUsage" WHERE "createdAt" >= ${days30}
      GROUP BY 1 ORDER BY 1`,
    prisma.llmUsage.groupBy({ by: ['providerName', 'model'], where: { createdAt: { gte: since } }, _sum: { totalTokens: true }, _count: { _all: true } }),
  ])

  const qMap = new Map(quotas.map(q => [q.userId, q]))
  const mMap = new Map(monthAgg.map(a => [a.userId, a]))
  const aMap = new Map(allAgg.map(a => [a.userId, a]))
  const lMap = new Map(lastUsed.map(a => [a.userId, a._max.createdAt]))

  const rows = users.map(u => {
    const q = qMap.get(u.id)
    const m = mMap.get(u.id)
    const used = m?._sum.totalTokens ?? 0
    const baseLimit = q?.monthlyLimit ?? defaults.defaultMonthlyTokens
    const bonus = q && q.bonusMonth === month ? q.bonusTokens : 0
    const limit = baseLimit === 0 ? 0 : baseLimit + bonus
    const percent = limit === 0 ? 0 : Math.round((used / limit) * 100)
    return {
      user: u,
      used, promptTokens: m?._sum.promptTokens ?? 0, completionTokens: m?._sum.completionTokens ?? 0, requests: m?._count._all ?? 0,
      allTimeTokens: aMap.get(u.id)?._sum.totalTokens ?? 0, allTimeRequests: aMap.get(u.id)?._count._all ?? 0,
      lastUsedAt: lMap.get(u.id) ?? null,
      baseLimit, bonus, limit, percent, remaining: limit === 0 ? -1 : Math.max(0, limit - used),
      hardLimit: q?.hardLimit ?? true, isCustom: !!q && q.monthlyLimit !== null, note: q?.note ?? null,
      exceeded: limit !== 0 && used >= limit, warn: limit !== 0 && percent >= defaults.warnPercent,
    }
  }).sort((a, b) => b.used - a.used)

  const totals = rows.reduce((acc, r) => ({ used: acc.used + r.used, requests: acc.requests + r.requests, prompt: acc.prompt + r.promptTokens, completion: acc.completion + r.completionTokens }), { used: 0, requests: 0, prompt: 0, completion: 0 })

  return NextResponse.json({
    month, defaults, rows, totals, pendingRequests: pending,
    daily: daily.map(d => ({ day: new Date(d.day).toISOString().slice(0, 10), tokens: Number(d.tokens), requests: Number(d.requests) })),
    byModel: byModel.map(b => ({ provider: b.providerName, model: b.model, tokens: b._sum.totalTokens ?? 0, requests: b._count._all })).sort((a, b) => b.tokens - a.tokens),
  })
}

async function _PUT(request: Request) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const patch: { defaultMonthlyTokens?: number; warnPercent?: number } = {}
  if (body.defaultMonthlyTokens !== undefined) {
    const n = Number(body.defaultMonthlyTokens)
    if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: 'defaultMonthlyTokens must be >= 0 (0 = unlimited)' }, { status: 400 })
    patch.defaultMonthlyTokens = Math.round(n)
  }
  if (body.warnPercent !== undefined) {
    const n = Number(body.warnPercent)
    if (!Number.isFinite(n) || n <= 0 || n > 100) return NextResponse.json({ error: 'warnPercent must be 1..100' }, { status: 400 })
    patch.warnPercent = Math.round(n)
  }
  await setPlatformDefaults(patch)
  return NextResponse.json({ ok: true, defaults: await getPlatformDefaults() })
}

export const PUT = withAudit(_PUT, { entity: 'llm_quota_defaults', verbs: { PUT: 'update' } })
