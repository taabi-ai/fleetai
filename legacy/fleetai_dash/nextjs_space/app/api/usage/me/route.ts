export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { withAudit } from '@/lib/audit'
import { notifyUsers } from '@/lib/notify'
import { getQuotaStatus } from '@/lib/usage'

/** Current user's AI usage, quota and credit requests. */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const [quota, requests, recent, daily] = await Promise.all([
    getQuotaStatus(userId),
    prisma.creditRequest.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 10 }),
    prisma.llmUsage.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 15, select: { id: true, model: true, providerName: true, feature: true, totalTokens: true, estimated: true, success: true, createdAt: true } }),
    prisma.$queryRaw<{ day: Date; tokens: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day, SUM("totalTokens")::bigint AS tokens
      FROM "LlmUsage" WHERE "userId" = ${userId} AND "createdAt" >= ${new Date(Date.now() - 30 * 24 * 3600 * 1000)}
      GROUP BY 1 ORDER BY 1`,
  ])
  return NextResponse.json({
    quota, requests, recent,
    daily: daily.map(d => ({ day: new Date(d.day).toISOString().slice(0, 10), tokens: Number(d.tokens) })),
  })
}

/** Submit a credit (token) request to the super admins. */
async function _POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const tokens = Math.round(Number(body.tokens))
  if (!Number.isFinite(tokens) || tokens < 1000 || tokens > 50_000_000) return NextResponse.json({ error: 'Request between 1,000 and 50,000,000 tokens' }, { status: 400 })
  const reason = body.reason ? String(body.reason).slice(0, 500) : null
  const pending = await prisma.creditRequest.count({ where: { userId: session.user.id, status: 'pending' } })
  if (pending >= 3) return NextResponse.json({ error: 'You already have 3 pending requests. Please wait for a review.' }, { status: 429 })
  const req = await prisma.creditRequest.create({ data: { userId: session.user.id, tokens, reason } })
  const admins = await prisma.user.findMany({ where: { role: 'super_admin', isActive: true }, select: { id: true } })
  await notifyUsers(admins.map(a => a.id), {
    title: 'AI credit request',
    message: `${session.user.email} requested ${tokens.toLocaleString('en-US')} tokens.${reason ? ` Reason: ${reason}` : ''}`,
    link: '/admin/usage', type: 'credits',
  })
  return NextResponse.json(req, { status: 201 })
}

export const POST = withAudit(_POST, { entity: 'credit_request', verbs: { POST: 'request' } })
