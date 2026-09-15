export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { notifyUsers } from '@/lib/notify'
import { withAudit } from '@/lib/audit'

async function ownedDashboard(id: string, userId: string) {
  return prisma.dashboard.findFirst({ where: { id, userId }, select: { id: true, name: true } })
}

// GET - people this dashboard is shared with + directory of users to pick from
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const dash = await ownedDashboard(id, session.user.id)
  if (!dash) return NextResponse.json({ error: 'Dashboard not found' }, { status: 404 })
  const [shares, users] = await Promise.all([
    prisma.dashboardShare.findMany({ where: { dashboardId: id }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'desc' } }),
    prisma.user.findMany({ where: { isActive: true, id: { not: session.user.id } }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' } }),
  ])
  return NextResponse.json({ shares, users })
}

// POST - share with users (by id or email). Creates notifications + emails.
async function _POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const dash = await ownedDashboard(id, session.user.id)
  if (!dash) return NextResponse.json({ error: 'Dashboard not found' }, { status: 404 })
  const body = await request.json().catch(() => ({}))
  const userIds: string[] = Array.isArray(body?.userIds) ? body.userIds : []
  const emails: string[] = Array.isArray(body?.emails) ? body.emails : []
  const message: string = typeof body?.message === 'string' ? body.message.slice(0, 300) : ''

  const byEmail = emails.length
    ? await prisma.user.findMany({ where: { email: { in: emails.map(e => e.trim().toLowerCase()) } }, select: { id: true } })
    : []
  const targets = Array.from(new Set([...userIds, ...byEmail.map(u => u.id)])).filter(uid => uid && uid !== session.user!.id)
  if (targets.length === 0) return NextResponse.json({ error: 'No valid recipients' }, { status: 400 })

  const existing = await prisma.dashboardShare.findMany({ where: { dashboardId: id, userId: { in: targets } }, select: { userId: true } })
  const fresh = targets.filter(t => !existing.some(e => e.userId === t))
  if (fresh.length) {
    await prisma.dashboardShare.createMany({ data: fresh.map(userId => ({ dashboardId: id, userId, sharedById: session.user!.id })) })
    const by = session.user.name ?? session.user.email ?? 'A colleague'
    await notifyUsers(fresh, {
      type: 'share',
      title: `${by} shared a dashboard with you`,
      message: `"${dash.name}" is now available in your workspace.${message ? ` Message: ${message}` : ''}`,
      link: `/dashboard?dashboard=${id}`,
    })
  }
  const shares = await prisma.dashboardShare.findMany({ where: { dashboardId: id }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'desc' } })
  return NextResponse.json({ shares, added: fresh.length })
}

// DELETE - revoke a share
async function _DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const dash = await ownedDashboard(id, session.user.id)
  if (!dash) return NextResponse.json({ error: 'Dashboard not found' }, { status: 404 })
  const body = await request.json().catch(() => ({}))
  if (!body?.userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })
  await prisma.dashboardShare.deleteMany({ where: { dashboardId: id, userId: body.userId } })
  return NextResponse.json({ success: true })
}

export const POST = withAudit(_POST, { entity: 'dashboard_share', verbs: { POST: 'share' } })
export const DELETE = withAudit(_DELETE, { entity: 'dashboard_share', verbs: { DELETE: 'unshare' } })
