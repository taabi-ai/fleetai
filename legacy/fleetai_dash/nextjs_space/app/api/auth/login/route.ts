export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { withAudit } from '@/lib/audit'

async function _POST(request: Request) {
  try {
    const body = await request.json()
    const { email, password } = body ?? {}
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user?.password) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }
    const isValid = await bcrypt.compare(password, user.password)
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }
    return NextResponse.json({ success: true, user: { id: user.id, email: user.email, name: user.name } })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Login failed' }, { status: 500 })
  }
}

export const POST = withAudit(_POST, { entity: 'auth', verbs: { POST: 'login' } })
