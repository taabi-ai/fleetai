export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { DASHBOARD_INCLUDE } from '@/lib/access'
import { withAudit } from '@/lib/audit'

// POST - clone a published dashboard (with all widgets) into the user's own dashboards
async function _POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const source = await prisma.dashboard.findFirst({
    where: { id, OR: [{ isPublished: true }, { userId: session.user.id }] },
    include: { widgets: true },
  })
  if (!source) return NextResponse.json({ error: 'Dashboard not found' }, { status: 404 })

  const clone = await prisma.dashboard.create({
    data: {
      userId: session.user.id,
      name: source.userId === session.user.id ? `${source.name} (copy)` : source.name,
      description: source.description,
      sourceId: source.id,
      widgets: {
        create: source.widgets.map(w => ({
          widgetConfig: w.widgetConfig as any,
          gridPos: w.gridPos as any,
        })),
      },
    },
    include: DASHBOARD_INCLUDE,
  })
  if (source.userId !== session.user.id) {
    await prisma.dashboard.update({ where: { id }, data: { cloneCount: { increment: 1 } } })
  }
  return NextResponse.json(clone, { status: 201 })
}

export const POST = withAudit(_POST, { entity: 'dashboard', verbs: { POST: 'clone' } })
