export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/admin'
import { withAudit } from '@/lib/audit'

async function _PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const data: Record<string, unknown> = {}
  if (typeof body?.label === 'string' && body.label.trim()) data.label = body.label.trim()
  if (typeof body?.path === 'string' && body.path.trim()) {
    const path = body.path.trim()
    const isExternal = /^https?:\/\//i.test(path)
    if (!isExternal && !path.startsWith('/')) return NextResponse.json({ error: 'Path must start with "/" or be a full URL' }, { status: 400 })
    data.path = path
    data.isExternal = isExternal
  }
  if (typeof body?.icon === 'string') data.icon = body.icon.trim() || null
  if (Number.isFinite(Number(body?.order))) data.order = Number(body.order)
  if (Array.isArray(body?.roles)) data.roles = body.roles.map(String)
  if (typeof body?.isActive === 'boolean') data.isActive = body.isActive
  const item = await prisma.menuItem.update({ where: { id }, data })
  return NextResponse.json(item)
}

async function _DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const exists = await prisma.menuItem.findUnique({ where: { id }, select: { id: true } })
  if (!exists) return NextResponse.json({ error: 'Menu item not found' }, { status: 404 })
  await prisma.menuItem.delete({ where: { id } })
  return NextResponse.json({ success: true })
}

export const PATCH = withAudit(_PATCH, { entity: 'menu_item' })
export const DELETE = withAudit(_DELETE, { entity: 'menu_item' })
