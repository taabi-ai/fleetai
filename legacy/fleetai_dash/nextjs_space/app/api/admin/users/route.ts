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

export async function GET() {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const users = await prisma.user.findMany({ select: USER_SELECT, orderBy: { createdAt: 'desc' } })
  return NextResponse.json(users)
}

async function _POST(request: Request) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const email = String(body?.email ?? '').trim().toLowerCase()
  const password = String(body?.password ?? '')
  const name = String(body?.name ?? '').trim() || null
  const role = (await isValidRole(body?.role)) ? body.role : 'user'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
  if (password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
  const exists = await prisma.user.findUnique({ where: { email } })
  if (exists) return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 })
  const user = await prisma.user.create({
    data: { email, name, role, isActive: body?.isActive !== false, password: await bcrypt.hash(password, 12) },
    select: USER_SELECT,
  })
  return NextResponse.json(user, { status: 201 })
}

export const POST = withAudit(_POST, { entity: 'user' })
