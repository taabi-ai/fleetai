export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { WIDGET_INCLUDE, getAccessibleDashboard } from '@/lib/access'
import { withAudit } from '@/lib/audit'

// POST - add a library widget to one of the user's dashboards
async function _POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await request.json()
  const { dashboardId } = body ?? {}
  if (!dashboardId) return NextResponse.json({ error: 'dashboardId is required' }, { status: 400 })

  const item = await prisma.libraryWidget.findUnique({ where: { id } })
  if (!item) return NextResponse.json({ error: 'Library widget not found' }, { status: 404 })
  const dashboard = await getAccessibleDashboard(dashboardId, session.user.id)
  if (!dashboard) return NextResponse.json({ error: 'Dashboard not found' }, { status: 404 })

  const pos = (item.gridPos as any) ?? {}
  const widget = await prisma.widget.create({
    data: {
      dashboardId,
      widgetConfig: item.widgetConfig as any,
      gridPos: { x: 0, y: 10000, w: pos.w ?? 6, h: pos.h ?? 4 },
    },
    include: WIDGET_INCLUDE,
  })
  await prisma.libraryWidget.update({ where: { id }, data: { useCount: { increment: 1 } } })
  return NextResponse.json(widget, { status: 201 })
}

export const POST = withAudit(_POST, { entity: 'library_widget', verbs: { POST: 'use' } })
