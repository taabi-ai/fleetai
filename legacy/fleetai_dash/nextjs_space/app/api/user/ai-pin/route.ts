export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { AI_UNLOCK_COOKIE, isAiUnlocked } from '@/lib/access'
import { withAudit } from '@/lib/audit'

// GET - status: does the user have a PIN, and is the assistant currently unlocked?
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { aiPin: true } })
  const cookieStore = await cookies()
  const unlocked = isAiUnlocked(cookieStore.get(AI_UNLOCK_COOKIE)?.value, session.user.id, user?.aiPin ?? null)
  return NextResponse.json({ hasPin: !!user?.aiPin, unlocked })
}

// POST - set or change PIN. Requires account password for confirmation.
async function _POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const pin = String(body?.pin ?? '')
  const password = String(body?.password ?? '')
  if (!/^\d{4,8}$/.test(pin)) {
    return NextResponse.json({ error: 'PIN must be 4 to 8 digits' }, { status: 400 })
  }
  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user?.password || !(await bcrypt.compare(password, user.password))) {
    return NextResponse.json({ error: 'Account password is incorrect' }, { status: 403 })
  }
  const hash = await bcrypt.hash(pin, 10)
  await prisma.user.update({ where: { id: user.id }, data: { aiPin: hash } })
  // Changing the PIN re-locks the assistant everywhere.
  const cookieStore = await cookies()
  cookieStore.delete(AI_UNLOCK_COOKIE)
  return NextResponse.json({ success: true, hasPin: true })
}

// DELETE - remove PIN protection. Requires account password.
async function _DELETE(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const password = String(body?.password ?? '')
  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user?.password || !(await bcrypt.compare(password, user.password))) {
    return NextResponse.json({ error: 'Account password is incorrect' }, { status: 403 })
  }
  await prisma.user.update({ where: { id: user.id }, data: { aiPin: null } })
  const cookieStore = await cookies()
  cookieStore.delete(AI_UNLOCK_COOKIE)
  return NextResponse.json({ success: true, hasPin: false })
}

export const POST = withAudit(_POST, { entity: 'ai_pin', verbs: { POST: 'set' } })
export const DELETE = withAudit(_DELETE, { entity: 'ai_pin', verbs: { DELETE: 'remove' } })
