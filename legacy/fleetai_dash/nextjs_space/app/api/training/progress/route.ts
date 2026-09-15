export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { withAudit } from '@/lib/audit'

/** Saves playback position / completion for the signed-in viewer. */
export const POST = withAudit(async (req: Request) => {
  const session = await auth()
  const user = session?.user
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const lessonId = String(body.lessonId ?? '')
  if (!lessonId) return NextResponse.json({ error: 'lessonId is required' }, { status: 400 })
  const lesson = await prisma.trainingLesson.findUnique({ where: { id: lessonId }, select: { id: true } })
  if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
  const positionSec = Math.max(0, Math.round(Number(body.positionSec ?? 0)))
  const completed = !!body.completed
  const existing = await prisma.trainingProgress.findUnique({ where: { userId_lessonId: { userId: user.id, lessonId } } })
  const row = await prisma.trainingProgress.upsert({
    where: { userId_lessonId: { userId: user.id, lessonId } },
    update: { positionSec, completed: completed || (existing?.completed ?? false) },
    create: { userId: user.id, lessonId, positionSec, completed },
  })
  return NextResponse.json({ progress: row })
}, { entity: 'training_progress', verbs: { POST: 'progress' } })
