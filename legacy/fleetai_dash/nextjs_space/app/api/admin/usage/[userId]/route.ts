export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/admin'
import { withAudit } from '@/lib/audit'
import { notifyUsers } from '@/lib/notify'
import { getQuotaStatus, grantBonus } from '@/lib/usage'

type Ctx = { params: Promise<{ userId: string }> }

/** Per-user detail: quota status, last 30 days daily series, recent requests. */
export async function GET(_req: Request, ctx: Ctx) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { userId } = await ctx.params
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, role: true } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  const [quota, recent, requests] = await Promise.all([
    getQuotaStatus(userId),
    prisma.llmUsage.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.creditRequest.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20 }),
  ])
  return NextResponse.json({ user, quota, recent, requests })
}

/** Update quota settings: monthlyLimit (null = platform default, 0 = unlimited), hardLimit, note. */
async function _PATCH(request: Request, ctx: Ctx) {
  const session = await auth()
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { userId } = await ctx.params
  const body = await request.json().catch(() => ({}))
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const data: { monthlyLimit?: number | null; hardLimit?: boolean; note?: string | null; updatedById: string } = { updatedById: session!.user.id }
  if ('monthlyLimit' in body) {
    if (body.monthlyLimit === null || body.monthlyLimit === '') data.monthlyLimit = null
    else {
      const n = Number(body.monthlyLimit)
      if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: 'monthlyLimit must be >= 0' }, { status: 400 })
      data.monthlyLimit = Math.round(n)
    }
  }
  if (typeof body.hardLimit === 'boolean') data.hardLimit = body.hardLimit
  if ('note' in body) data.note = body.note ? String(body.note).slice(0, 500) : null

  await prisma.userQuota.upsert({ where: { userId }, update: data, create: { userId, ...data } })
  return NextResponse.json({ ok: true, quota: await getQuotaStatus(userId) })
}

/** Grant bonus tokens for the current month (negative values revoke). */
async function _POST(request: Request, ctx: Ctx) {
  const session = await auth()
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { userId } = await ctx.params
  const body = await request.json().catch(() => ({}))
  const tokens = Math.round(Number(body.tokens))
  if (!Number.isFinite(tokens) || tokens === 0) return NextResponse.json({ error: 'tokens must be a non-zero number' }, { status: 400 })
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  await grantBonus(userId, tokens, session!.user.id, body.note ? String(body.note).slice(0, 500) : undefined)
  await notifyUsers([userId], {
    title: tokens > 0 ? 'AI credits added' : 'AI credits adjusted',
    message: tokens > 0
      ? `${tokens.toLocaleString('en-US')} bonus tokens were added to your AI allowance for this month.${body.note ? ` Note: ${body.note}` : ''}`
      : `${Math.abs(tokens).toLocaleString('en-US')} bonus tokens were removed from your AI allowance for this month.`,
    link: '/dashboard', type: 'credits',
  })
  return NextResponse.json({ ok: true, quota: await getQuotaStatus(userId), label: user.email })
}

export const PATCH = withAudit(_PATCH, { entity: 'llm_quota', verbs: { PATCH: 'update' }, idParam: 'userId' })
export const POST = withAudit(_POST, { entity: 'llm_credits', verbs: { POST: 'grant' }, idParam: 'userId' })
