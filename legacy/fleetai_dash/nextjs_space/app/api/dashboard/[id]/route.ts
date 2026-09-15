export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { DASHBOARD_INCLUDE, getAccessibleDashboard } from '@/lib/access'
import { notifyUsers } from '@/lib/notify'
import { withAudit } from '@/lib/audit'

// GET - fetch one dashboard (owner or published)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const access = await getAccessibleDashboard(id, session.user.id)
  if (!access) return NextResponse.json({ error: 'Dashboard not found' }, { status: 404 })
  const dashboard = await prisma.dashboard.findUnique({ where: { id }, include: DASHBOARD_INCLUDE })
  return NextResponse.json(dashboard)
}

// PATCH - rename / describe / publish / unpublish (owner only)
async function _PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const body = await request.json()
  const existing = await prisma.dashboard.findFirst({ where: { id, userId: session.user.id } })
  if (!existing) return NextResponse.json({ error: 'Dashboard not found' }, { status: 404 })

  const data: any = {}
  if (typeof body?.name === 'string' && body.name.trim()) data.name = body.name.trim().slice(0, 80)
  if (typeof body?.description === 'string') data.description = body.description.slice(0, 300)
  else if (body?.description === null) data.description = null
  if (typeof body?.isPublished === 'boolean') {
    data.isPublished = body.isPublished
    data.publishedAt = body.isPublished ? new Date() : null
  }
  const dashboard = await prisma.dashboard.update({ where: { id }, data, include: DASHBOARD_INCLUDE })

  // Publishing to the marketplace notifies every other active user (in-app + email when SMTP is configured).
  if (data.isPublished === true && !existing.isPublished) {
    const others = await prisma.user.findMany({ where: { isActive: true, id: { not: session.user.id } }, select: { id: true } })
    const by = session.user.name ?? session.user.email ?? 'A colleague'
    await notifyUsers(others.map(u => u.id), {
      type: 'publish',
      title: `New dashboard published: ${dashboard.name}`,
      message: `${by} published "${dashboard.name}" to the marketplace. You can open it and collaborate, or clone it to your own workspace.`,
      link: `/dashboard?dashboard=${dashboard.id}`,
    })
  }
  return NextResponse.json(dashboard)
}

async function _DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const existing = await prisma.dashboard.findFirst({ where: { id, userId: session.user.id } })
  if (!existing) return NextResponse.json({ error: 'Dashboard not found' }, { status: 404 })
  await prisma.dashboard.delete({ where: { id } })
  return NextResponse.json({ success: true })
}

export const PATCH = withAudit(_PATCH, { entity: 'dashboard' })
export const DELETE = withAudit(_DELETE, { entity: 'dashboard' })
