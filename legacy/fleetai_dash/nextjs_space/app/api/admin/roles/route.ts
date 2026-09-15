export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/admin'
import { PERMISSIONS, PERMISSION_KEYS, ensureDefaultRoles, invalidateRoleCache } from '@/lib/rbac'
import { withAudit } from '@/lib/audit'

export async function GET() {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  await ensureDefaultRoles() // idempotent: creates missing default roles, appends newly introduced permissions
  const ORDER = ['user', 'manager', 'sales', 'crm_manager', 'engineer', 'eng_manager', 'super_admin']
  const rank = (n: string) => { const i = ORDER.indexOf(n); return i === -1 ? ORDER.length : i }
  const roles = (await prisma.role.findMany({ orderBy: { name: 'asc' } }))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))
  const usage = await prisma.user.groupBy({ by: ['role'], _count: { _all: true } })
  const counts = Object.fromEntries(usage.map(u => [u.role, u._count._all]))
  return NextResponse.json({
    permissions: PERMISSIONS,
    roles: roles.map(r => ({ ...r, userCount: counts[r.name] ?? 0 })),
  })
}

async function _POST(request: Request) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const name = String(body?.name ?? '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
  const label = String(body?.label ?? '').trim()
  if (!name || !label) return NextResponse.json({ error: 'Role key and label are required' }, { status: 400 })
  if (await prisma.role.findUnique({ where: { name } })) return NextResponse.json({ error: 'A role with this key already exists' }, { status: 409 })
  const permissions = Array.isArray(body?.permissions) ? body.permissions.filter((p: unknown) => typeof p === 'string' && (PERMISSION_KEYS as string[]).includes(p)) : []
  const role = await prisma.role.create({
    data: { name, label, description: typeof body?.description === 'string' ? body.description.slice(0, 300) : null, permissions, isSystem: false },
  })
  invalidateRoleCache()
  return NextResponse.json({ ...role, userCount: 0 }, { status: 201 })
}

export const POST = withAudit(_POST, { entity: 'role' })
