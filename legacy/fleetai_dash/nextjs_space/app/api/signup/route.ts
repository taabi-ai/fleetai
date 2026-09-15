export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { withAudit } from '@/lib/audit'

async function _POST(request: Request) {
  try {
    const body = await request.json()
    const { email, password, name } = body ?? {}
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
    }
    const hashedPassword = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: { email, password: hashedPassword, name: name ?? email.split('@')[0] },
    })
    return NextResponse.json({ success: true, user: { id: user.id, email: user.email, name: user.name } }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Signup failed' }, { status: 500 })
  }
}

export const POST = withAudit(_POST, { entity: 'account', verbs: { POST: 'signup' } })
