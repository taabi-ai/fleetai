export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { WIDGET_INCLUDE, getAccessibleDashboard } from '@/lib/access'
import { withAudit } from '@/lib/audit'

// POST - lock widget for the current user
async function _POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; widgetId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, widgetId } = await params
  const dashboard = await getAccessibleDashboard(id, session.user.id)
  if (!dashboard) return NextResponse.json({ error: 'Dashboard not found' }, { status: 404 })

  const widget = await prisma.widget.findFirst({ where: { id: widgetId, dashboardId: id }, include: WIDGET_INCLUDE })
  if (!widget) return NextResponse.json({ error: 'Widget not found' }, { status: 404 })
  if (widget.lockedById && widget.lockedById !== session.user.id) {
    return NextResponse.json(
      { error: `Already locked by ${widget.lockedBy?.name ?? widget.lockedBy?.email ?? 'another user'}` },
      { status: 423 }
    )
  }
  const updated = await prisma.widget.update({
    where: { id: widgetId },
    data: { lockedById: session.user.id, lockedAt: new Date() },
    include: WIDGET_INCLUDE,
  })
  return NextResponse.json(updated)
}

// DELETE - unlock. Allowed for the locker, or the dashboard owner (override).
async function _DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; widgetId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, widgetId } = await params
  const dashboard = await getAccessibleDashboard(id, session.user.id)
  if (!dashboard) return NextResponse.json({ error: 'Dashboard not found' }, { status: 404 })

  const widget = await prisma.widget.findFirst({ where: { id: widgetId, dashboardId: id } })
  if (!widget) return NextResponse.json({ error: 'Widget not found' }, { status: 404 })
  const isOwner = dashboard.userId === session.user.id
  if (widget.lockedById && widget.lockedById !== session.user.id && !isOwner) {
    return NextResponse.json({ error: 'Only the user who locked this widget (or the dashboard owner) can unlock it' }, { status: 403 })
  }
  const updated = await prisma.widget.update({
    where: { id: widgetId },
    data: { lockedById: null, lockedAt: null },
    include: WIDGET_INCLUDE,
  })
  return NextResponse.json(updated)
}

export const POST = withAudit(_POST, { entity: 'widget', verbs: { POST: 'lock' } })
export const DELETE = withAudit(_DELETE, { entity: 'widget', verbs: { DELETE: 'unlock' } })
