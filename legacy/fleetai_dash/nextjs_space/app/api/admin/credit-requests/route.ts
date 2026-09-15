export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/admin'
import { withAudit } from '@/lib/audit'
import { notifyUsers } from '@/lib/notify'
import { grantBonus } from '@/lib/usage'

export async function GET(request: Request) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const status = new URL(request.url).searchParams.get('status') ?? ''
  const items = await prisma.creditRequest.findMany({ where: status ? { status } : {}, orderBy: { createdAt: 'desc' }, take: 200 })
  const ids = Array.from(new Set(items.map(i => i.userId)))
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true, role: true } })
  const uMap = new Map(users.map(u => [u.id, u]))
  return NextResponse.json(items.map(i => ({ ...i, user: uMap.get(i.userId) ?? null })))
}

/** Approve / reject a credit request. Approving grants the tokens (optionally overridden) as a bonus. */
async function _PATCH(request: Request) {
  const session = await auth()
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const id = String(body.id ?? '')
  const decision = body.decision === 'approved' ? 'approved' : body.decision === 'rejected' ? 'rejected' : null
  if (!id || !decision) return NextResponse.json({ error: 'id and decision (approved|rejected) required' }, { status: 400 })
  const req = await prisma.creditRequest.findUnique({ where: { id } })
  if (!req) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  const reqUser = await prisma.user.findUnique({ where: { id: req.userId }, select: { email: true } })
  if (req.status !== 'pending') return NextResponse.json({ error: 'Request already reviewed' }, { status: 409 })

  const tokens = decision === 'approved' ? Math.max(1, Math.round(Number(body.tokens ?? req.tokens) || req.tokens)) : req.tokens
  const note = body.note ? String(body.note).slice(0, 500) : null
  const updated = await prisma.creditRequest.update({
    where: { id },
    data: { status: decision, reviewedById: session!.user.id, reviewNote: note, reviewedAt: new Date(), ...(decision === 'approved' ? { tokens } : {}) },
  })
  if (decision === 'approved') await grantBonus(req.userId, tokens, session!.user.id, note ? `Credit request: ${note}` : 'Credit request approved')
  await notifyUsers([req.userId], {
    title: decision === 'approved' ? 'Credit request approved' : 'Credit request declined',
    message: decision === 'approved'
      ? `${tokens.toLocaleString('en-US')} tokens were added to your AI allowance for this month.${note ? ` ${note}` : ''}`
      : `Your request for ${req.tokens.toLocaleString('en-US')} tokens was declined.${note ? ` Reason: ${note}` : ''}`,
    link: '/dashboard', type: 'credits',
  })
  return NextResponse.json({ ...updated, label: reqUser?.email ?? req.userId })
}

export const PATCH = withAudit(_PATCH, { entity: 'credit_request', verbs: { PATCH: 'review' } })
