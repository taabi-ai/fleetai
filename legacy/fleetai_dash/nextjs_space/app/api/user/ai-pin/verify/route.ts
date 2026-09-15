export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { AI_UNLOCK_COOKIE, aiUnlockToken } from '@/lib/access'
import { withAudit } from '@/lib/audit'

// POST - verify PIN and unlock the assistant for this browser session
async function _POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const pin = String(body?.pin ?? '')
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, aiPin: true } })
  if (!user?.aiPin) return NextResponse.json({ success: true, unlocked: true })
  const ok = await bcrypt.compare(pin, user.aiPin)
  if (!ok) return NextResponse.json({ error: 'Incorrect PIN' }, { status: 403 })
  const cookieStore = await cookies()
  // Session cookie (no maxAge): the assistant re-locks when the browser is closed.
  cookieStore.set(AI_UNLOCK_COOKIE, aiUnlockToken(user.id, user.aiPin), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  })
  return NextResponse.json({ success: true, unlocked: true })
}

// DELETE - lock the assistant again
async function _DELETE() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const cookieStore = await cookies()
  cookieStore.delete(AI_UNLOCK_COOKIE)
  return NextResponse.json({ success: true, unlocked: false })
}

export const POST = withAudit(_POST, { entity: 'ai_pin', verbs: { POST: 'verify' } })
export const DELETE = withAudit(_DELETE, { entity: 'ai_pin', verbs: { DELETE: 'relock' } })
