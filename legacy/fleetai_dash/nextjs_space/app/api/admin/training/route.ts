export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { withAudit } from '@/lib/audit'
import { AUDIENCES, LEVELS, canManageTraining, slugify } from '@/lib/training'

async function manager() {
  const session = await auth()
  const user = session?.user
  if (!user?.id || !(await canManageTraining(user.role))) return null
  return user
}

export async function GET() {
  if (!(await manager())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const modules = await prisma.trainingModule.findMany({
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    include: { lessons: { orderBy: { order: 'asc' } } },
  })
  const lessonIds = modules.flatMap(m => m.lessons.map(l => l.id))
  const [views, completions, assets] = await Promise.all([
    lessonIds.length ? prisma.trainingProgress.groupBy({ by: ['lessonId'], _count: { _all: true }, where: { lessonId: { in: lessonIds } } }) : [],
    lessonIds.length ? prisma.trainingProgress.groupBy({ by: ['lessonId'], _count: { _all: true }, where: { lessonId: { in: lessonIds }, completed: true } }) : [],
    prisma.mediaAsset.findMany({ where: { id: { in: modules.flatMap(m => [m.coverAssetId, ...m.lessons.map(l => l.videoAssetId)]).filter(Boolean) as string[] } }, select: { id: true, title: true, fileName: true, durationSec: true, size: true } }),
  ])
  const vMap = new Map(views.map(v => [v.lessonId, v._count._all]))
  const cMap = new Map(completions.map(v => [v.lessonId, v._count._all]))
  const aMap = new Map(assets.map(a => [a.id, a]))
  return NextResponse.json({
    audiences: AUDIENCES, levels: LEVELS,
    modules: modules.map(m => ({
      ...m,
      coverAsset: m.coverAssetId ? aMap.get(m.coverAssetId) ?? null : null,
      lessons: m.lessons.map(l => ({ ...l, videoAsset: l.videoAssetId ? aMap.get(l.videoAssetId) ?? null : null, views: vMap.get(l.id) ?? 0, completions: cMap.get(l.id) ?? 0 })),
    })),
  })
}

export const POST = withAudit(async (req: Request) => {
  const user = await manager()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const title = String(body.title ?? '').trim()
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  let slug = slugify(String(body.slug ?? title))
  if (await prisma.trainingModule.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36)}`
  const audience = (AUDIENCES as readonly string[]).includes(body.audience) ? body.audience : 'customer'
  const level = (LEVELS as readonly string[]).includes(body.level) ? body.level : 'beginner'
  const max = await prisma.trainingModule.aggregate({ _max: { order: true } })
  const mod = await prisma.trainingModule.create({
    data: {
      title, slug, audience, level,
      description: body.description ? String(body.description).slice(0, 2000) : null,
      order: (max._max.order ?? 0) + 1,
      isPublished: !!body.isPublished,
      coverAssetId: body.coverAssetId ? String(body.coverAssetId) : null,
      createdById: user.id,
    },
  })
  return NextResponse.json({ module: mod }, { status: 201 })
}, { entity: 'training_module' })
