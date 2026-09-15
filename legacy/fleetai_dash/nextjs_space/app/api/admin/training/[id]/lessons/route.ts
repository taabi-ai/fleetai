export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { withAudit } from '@/lib/audit'
import { canManageTraining, normalizeChapters } from '@/lib/training'

type Ctx = { params: Promise<{ id: string }> }

export const POST = withAudit(async (req: Request, ctx: Ctx) => {
  const session = await auth()
  if (!session?.user?.id || !(await canManageTraining(session.user.role))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await ctx.params
  const mod = await prisma.trainingModule.findUnique({ where: { id } })
  if (!mod) return NextResponse.json({ error: 'Module not found' }, { status: 404 })
  const body = await req.json().catch(() => ({}))
  const title = String(body.title ?? '').trim()
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  let durationSec: number | null = body.durationSec != null ? Math.round(Number(body.durationSec)) : null
  if (body.videoAssetId) {
    const asset = await prisma.mediaAsset.findUnique({ where: { id: String(body.videoAssetId) } })
    if (!asset) return NextResponse.json({ error: 'Video asset not found' }, { status: 404 })
    if (durationSec == null) durationSec = asset.durationSec
  }
  const max = await prisma.trainingLesson.aggregate({ where: { moduleId: id }, _max: { order: true } })
  const lesson = await prisma.trainingLesson.create({
    data: {
      moduleId: id, title,
      description: body.description ? String(body.description).slice(0, 2000) : null,
      order: (max._max.order ?? 0) + 1,
      videoAssetId: body.videoAssetId ? String(body.videoAssetId) : null,
      videoUrl: body.videoUrl ? String(body.videoUrl).trim() : null,
      durationSec,
      chapters: normalizeChapters(body.chapters),
      notes: body.notes ? String(body.notes).slice(0, 20000) : null,
    },
  })
  return NextResponse.json({ lesson }, { status: 201 })
}, { entity: 'training_lesson', idParam: 'id' })
