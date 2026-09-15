export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { withAudit } from '@/lib/audit'
import { canManageTraining, normalizeChapters } from '@/lib/training'

type Ctx = { params: Promise<{ lessonId: string }> }

async function allowed() {
  const session = await auth()
  return !!session?.user?.id && (await canManageTraining(session.user.role))
}

export const PATCH = withAudit(async (req: Request, ctx: Ctx) => {
  if (!(await allowed())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { lessonId } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const data: any = {}
  if (typeof body.title === 'string' && body.title.trim()) data.title = body.title.trim()
  if (body.description !== undefined) data.description = body.description ? String(body.description).slice(0, 2000) : null
  if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).slice(0, 20000) : null
  if (body.order !== undefined) data.order = Number(body.order) || 0
  if (body.videoUrl !== undefined) data.videoUrl = body.videoUrl ? String(body.videoUrl).trim() : null
  if (body.chapters !== undefined) data.chapters = normalizeChapters(body.chapters)
  if (body.durationSec !== undefined) data.durationSec = body.durationSec == null ? null : Math.round(Number(body.durationSec))
  if (body.videoAssetId !== undefined) {
    if (body.videoAssetId) {
      const asset = await prisma.mediaAsset.findUnique({ where: { id: String(body.videoAssetId) } })
      if (!asset) return NextResponse.json({ error: 'Video asset not found' }, { status: 404 })
      data.videoAssetId = asset.id
      if (data.durationSec === undefined && asset.durationSec) data.durationSec = asset.durationSec
    } else data.videoAssetId = null
  }
  const lesson = await prisma.trainingLesson.update({ where: { id: lessonId }, data })
  return NextResponse.json({ lesson })
}, { entity: 'training_lesson' })

export const DELETE = withAudit(async (_req: Request, ctx: Ctx) => {
  if (!(await allowed())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { lessonId } = await ctx.params
  const exists = await prisma.trainingLesson.findUnique({ where: { id: lessonId }, select: { id: true } })
  if (!exists) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
  await prisma.trainingLesson.delete({ where: { id: lessonId } })
  return NextResponse.json({ ok: true })
}, { entity: 'training_lesson' })
