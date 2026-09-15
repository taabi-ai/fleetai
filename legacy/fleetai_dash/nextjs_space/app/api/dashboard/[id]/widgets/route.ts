export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { WIDGET_INCLUDE, getAccessibleDashboard } from '@/lib/access'
import { withAudit } from '@/lib/audit'

// POST - add widget to dashboard
async function _POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const body = await request.json()
  const { widgetConfig, gridPos } = body ?? {}

  const dashboard = await getAccessibleDashboard(id, session.user.id)
  if (!dashboard) {
    return NextResponse.json({ error: 'Dashboard not found' }, { status: 404 })
  }

  const widget = await prisma.widget.create({
    data: {
      dashboardId: id,
      widgetConfig: widgetConfig ?? {},
      gridPos: gridPos ?? {},
    },
    include: WIDGET_INCLUDE,
  })
  await prisma.dashboard.update({ where: { id }, data: { updatedAt: new Date() } })
  return NextResponse.json(widget, { status: 201 })
}

// PUT - update all widget positions (batch). Widgets locked by another user are skipped.
async function _PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const body = await request.json()
  const { widgets } = body ?? {}

  if (!Array.isArray(widgets)) {
    return NextResponse.json({ error: 'Invalid widgets array' }, { status: 400 })
  }
  const dashboard = await getAccessibleDashboard(id, session.user.id)
  if (!dashboard) {
    return NextResponse.json({ error: 'Dashboard not found' }, { status: 404 })
  }

  const userId = session.user.id
  const updates = (widgets ?? []).map((w: any) =>
    prisma.widget.updateMany({
      where: {
        id: w?.id,
        dashboardId: id,
        OR: [{ lockedById: null }, { lockedById: userId }],
      },
      data: { gridPos: w?.gridPos ?? {} },
    })
  )
  await Promise.all(updates)
  return NextResponse.json({ success: true })
}

export const POST = withAudit(_POST, { entity: 'widget', verbs: { POST: 'create' } })
export const PUT = withAudit(_PUT, { entity: 'widget', verbs: { PUT: 'layout' } })
