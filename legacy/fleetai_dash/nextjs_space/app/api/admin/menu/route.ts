export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/admin'
import { DEFAULT_MENU } from '@/lib/menu'
import { withAudit } from '@/lib/audit'

export async function GET() {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  let items = await prisma.menuItem.findMany({ orderBy: { order: 'asc' } })
  if (items.length === 0) {
    await prisma.menuItem.createMany({ data: DEFAULT_MENU })
    items = await prisma.menuItem.findMany({ orderBy: { order: 'asc' } })
  }
  return NextResponse.json(items)
}

async function _POST(request: Request) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const label = String(body?.label ?? '').trim()
  const path = String(body?.path ?? '').trim()
  const isExternal = !!body?.isExternal || /^https?:\/\//i.test(path)
  if (!label || !path || (!isExternal && !path.startsWith('/'))) {
    return NextResponse.json({ error: 'Label and a path starting with "/" (or a full URL) are required' }, { status: 400 })
  }
  const maxOrder = await prisma.menuItem.aggregate({ _max: { order: true } })
  const item = await prisma.menuItem.create({
    data: {
      label, path, isExternal,
      icon: typeof body?.icon === 'string' ? body.icon.trim() || null : null,
      order: Number.isFinite(Number(body?.order)) ? Number(body.order) : (maxOrder._max.order ?? 0) + 1,
      roles: Array.isArray(body?.roles) ? body.roles.map(String) : [],
      isActive: body?.isActive !== false,
    },
  })
  return NextResponse.json(item, { status: 201 })
}

export const POST = withAudit(_POST, { entity: 'menu_item' })
