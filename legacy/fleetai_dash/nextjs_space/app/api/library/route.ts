export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { withAudit } from '@/lib/audit'

const LIB_INCLUDE = { owner: { select: { id: true, name: true, email: true } } } as const

// GET - list all published library widgets
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const items = await prisma.libraryWidget.findMany({
    include: LIB_INCLUDE,
    orderBy: [{ useCount: 'desc' }, { createdAt: 'desc' }],
  })
  return NextResponse.json(items)
}

// POST - publish a widget to the library (snapshot of its config)
async function _POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const { widgetConfig, gridPos, title, description } = body ?? {}
  if (!widgetConfig?.type) return NextResponse.json({ error: 'widgetConfig is required' }, { status: 400 })
  const item = await prisma.libraryWidget.create({
    data: {
      ownerId: session.user.id,
      title: (title ?? widgetConfig?.title ?? 'Untitled widget').toString().slice(0, 80),
      description: description ? description.toString().slice(0, 300) : null,
      widgetConfig,
      gridPos: gridPos ?? { w: 6, h: 4 },
    },
    include: LIB_INCLUDE,
  })
  return NextResponse.json(item, { status: 201 })
}

export const POST = withAudit(_POST, { entity: 'library_widget', verbs: { POST: 'publish' } })
