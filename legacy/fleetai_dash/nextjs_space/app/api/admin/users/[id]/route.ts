export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/admin'
import { isValidRole } from '@/lib/rbac'
import { withAudit } from '@/lib/audit'

const USER_SELECT = {
  id: true, name: true, email: true, role: true, isActive: true, createdAt: true, updatedAt: true,
  _count: { select: { dashboards: true, libraryWidgets: true } },
} as const

async function _PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSuperAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const data: Record<string, unknown> = {}
  if (typeof body?.name === 'string') data.name = body.name.trim() || null
  if (typeof body?.email === 'string') {
    const email = body.email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    const other = await prisma.user.findFirst({ where: { email, id: { not: id } } })
    if (other) return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
    data.email = email
  }
  if (typeof body?.role === 'string' && (await isValidRole(body.role))) {
    if (id === session.user.id && body.role !== 'super_admin') return NextResponse.json({ error: 'You cannot remove your own super admin role' }, { status: 400 })
    data.role = body.role
  }
  if (typeof body?.isActive === 'boolean') {
    if (id === session.user.id && !body.isActive) return NextResponse.json({ error: 'You cannot deactivate your own account' }, { status: 400 })
    data.isActive = body.isActive
  }
  if (typeof body?.password === 'string' && body.password) {
    if (body.password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    data.password = await bcrypt.hash(body.password, 12)
  }
  if (body?.clearPin) data.aiPin = null
  const user = await prisma.user.update({ where: { id }, data, select: USER_SELECT })
  return NextResponse.json(user)
}

async function _DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSuperAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  if (id === session.user.id) return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 })
  const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } })
  if (!exists) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  await prisma.user.delete({ where: { id } })
  return NextResponse.json({ success: true })
}

export const PATCH = withAudit(_PATCH, { entity: 'user' })
export const DELETE = withAudit(_DELETE, { entity: 'user' })
