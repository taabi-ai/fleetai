export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { withAudit } from '@/lib/audit'

// GET - latest notifications + unread count
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: 'desc' }, take: 25 }),
    prisma.notification.count({ where: { userId: session.user.id, read: false } }),
  ])
  return NextResponse.json({ items, unread })
}

// PATCH - mark read: { ids: string[] } or { all: true }
async function _PATCH(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  if (body?.all) {
    await prisma.notification.updateMany({ where: { userId: session.user.id, read: false }, data: { read: true } })
  } else if (Array.isArray(body?.ids) && body.ids.length) {
    await prisma.notification.updateMany({ where: { userId: session.user.id, id: { in: body.ids } }, data: { read: true } })
  }
  const unread = await prisma.notification.count({ where: { userId: session.user.id, read: false } })
  return NextResponse.json({ success: true, unread })
}

// DELETE - clear all notifications
async function _DELETE() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await prisma.notification.deleteMany({ where: { userId: session.user.id } })
  return NextResponse.json({ success: true })
}

export const PATCH = withAudit(_PATCH, { entity: 'notification', verbs: { PATCH: 'read' } })
export const DELETE = withAudit(_DELETE, { entity: 'notification', verbs: { DELETE: 'clear' } })
