export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSuperAdmin, SUPER_ADMIN } from '@/lib/admin'
import { PERMISSION_KEYS, invalidateRoleCache } from '@/lib/rbac'
import { withAudit } from '@/lib/audit'

type Ctx = { params: Promise<{ name: string }> }

async function _PATCH(request: Request, { params }: Ctx) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { name } = await params
  const existing = await prisma.role.findUnique({ where: { name } })
  if (!existing) return NextResponse.json({ error: 'Role not found' }, { status: 404 })
  const body = await request.json().catch(() => ({}))
  const data: { label?: string; description?: string | null; permissions?: string[] } = {}
  if (typeof body?.label === 'string' && body.label.trim()) data.label = body.label.trim()
  if (typeof body?.description === 'string') data.description = body.description.slice(0, 300) || null
  if (Array.isArray(body?.permissions)) {
    if (name === SUPER_ADMIN) return NextResponse.json({ error: 'The super admin role always holds every permission' }, { status: 400 })
    data.permissions = body.permissions.filter((p: unknown) => typeof p === 'string' && (PERMISSION_KEYS as string[]).includes(p))
  }
  const role = await prisma.role.update({ where: { name }, data })
  invalidateRoleCache()
  return NextResponse.json(role)
}

async function _DELETE(_request: Request, { params }: Ctx) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { name } = await params
  const existing = await prisma.role.findUnique({ where: { name } })
  if (!existing) return NextResponse.json({ error: 'Role not found' }, { status: 404 })
  if (existing.isSystem) return NextResponse.json({ error: 'System roles cannot be deleted' }, { status: 400 })
  const inUse = await prisma.user.count({ where: { role: name } })
  if (inUse > 0) return NextResponse.json({ error: `${inUse} user(s) still have this role. Reassign them first.` }, { status: 409 })
  await prisma.role.delete({ where: { name } })
  invalidateRoleCache()
  return NextResponse.json({ ok: true })
}

export const PATCH = withAudit(_PATCH, { entity: 'role' })
export const DELETE = withAudit(_DELETE, { entity: 'role' })
