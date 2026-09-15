export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { WIDGET_INCLUDE, getAccessibleDashboard, isLockedByOther } from '@/lib/access'
import { withAudit } from '@/lib/audit'

async function loadWidget(dashboardId: string, widgetId: string, userId: string) {
  const dashboard = await getAccessibleDashboard(dashboardId, userId)
  if (!dashboard) return { error: NextResponse.json({ error: 'Dashboard not found' }, { status: 404 }) }
  const widget = await prisma.widget.findFirst({ where: { id: widgetId, dashboardId }, include: WIDGET_INCLUDE })
  if (!widget) return { error: NextResponse.json({ error: 'Widget not found' }, { status: 404 }) }
  if (isLockedByOther(widget, userId)) {
    return {
      error: NextResponse.json(
        { error: `This widget is locked by ${widget.lockedBy?.name ?? widget.lockedBy?.email ?? 'another user'}` },
        { status: 423 }
      ),
    }
  }
  return { widget }
}

async function _DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; widgetId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id, widgetId } = await params
  const { error } = await loadWidget(id, widgetId, session.user.id)
  if (error) return error
  await prisma.widget.delete({ where: { id: widgetId } })
  return NextResponse.json({ success: true })
}

async function _PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; widgetId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id, widgetId } = await params
  const { error } = await loadWidget(id, widgetId, session.user.id)
  if (error) return error
  const body = await request.json()
  const updated = await prisma.widget.update({
    where: { id: widgetId },
    data: {
      ...(body?.widgetConfig ? { widgetConfig: body.widgetConfig } : {}),
      ...(body?.gridPos ? { gridPos: body.gridPos } : {}),
    },
    include: WIDGET_INCLUDE,
  })
  return NextResponse.json(updated)
}

export const DELETE = withAudit(_DELETE, { entity: 'widget' })
export const PATCH = withAudit(_PATCH, { entity: 'widget' })
