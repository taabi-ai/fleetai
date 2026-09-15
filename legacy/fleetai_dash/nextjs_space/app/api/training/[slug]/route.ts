export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { audiencesFor, lessonVideoUrl } from '@/lib/training'

/** A module with all lessons, playable URLs and the viewer's progress. */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const session = await auth()
  const user = session?.user
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { slug } = await ctx.params
  const audiences = await audiencesFor(user.role)
  const mod = await prisma.trainingModule.findUnique({ where: { slug }, include: { lessons: { orderBy: { order: 'asc' } } } })
  if (!mod || !mod.isPublished || !audiences.includes(mod.audience as any)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const progress = await prisma.trainingProgress.findMany({ where: { userId: user.id, lessonId: { in: mod.lessons.map(l => l.id) } } })
  const pMap = new Map(progress.map(p => [p.lessonId, p]))
  const lessons = []
  for (const l of mod.lessons) {
    const { url, contentType } = await lessonVideoUrl(l)
    const p = pMap.get(l.id)
    lessons.push({
      id: l.id, title: l.title, description: l.description, order: l.order, durationSec: l.durationSec, chapters: l.chapters ?? [], notes: l.notes,
      videoUrl: url, contentType, positionSec: p?.positionSec ?? 0, completed: p?.completed ?? false,
    })
  }
  return NextResponse.json({ module: { id: mod.id, slug: mod.slug, title: mod.title, description: mod.description, audience: mod.audience, level: mod.level }, lessons })
}
