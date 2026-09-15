export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

// GET - list all published dashboards
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const dashboards = await prisma.dashboard.findMany({
    where: { isPublished: true },
    include: {
      user: { select: { id: true, name: true, email: true } },
      widgets: { select: { id: true, widgetConfig: true } },
    },
    orderBy: [{ publishedAt: 'desc' }],
  })
  return NextResponse.json(dashboards)
}
