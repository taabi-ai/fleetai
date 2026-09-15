export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { DASHBOARD_INCLUDE } from '@/lib/access'
import { withAudit } from '@/lib/audit'

// GET - fetch user's dashboards
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const dashboards = await prisma.dashboard.findMany({
    where: { userId: session.user.id },
    include: DASHBOARD_INCLUDE,
    orderBy: { updatedAt: 'desc' },
  })
  return NextResponse.json(dashboards)
}

// POST - create a new dashboard
async function _POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await request.json()
  const { name, description } = body ?? {}
  const dashboard = await prisma.dashboard.create({
    data: {
      name: (name ?? 'My Dashboard').toString().slice(0, 80),
      description: description ? description.toString().slice(0, 300) : null,
      userId: session.user.id,
    },
    include: DASHBOARD_INCLUDE,
  })
  return NextResponse.json(dashboard, { status: 201 })
}

export const POST = withAudit(_POST, { entity: 'dashboard' })
