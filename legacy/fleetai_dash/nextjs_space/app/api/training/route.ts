export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { audiencesFor, canManageTraining } from '@/lib/training'
import { getFileUrl } from '@/lib/storage'

/** Published modules visible to the current user, with per-module progress. */
export async function GET() {
  const session = await auth()
  const user = session?.user
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const audiences = await audiencesFor(user.role)
  const canManage = await canManageTraining(user.role)
  const modules = await prisma.trainingModule.findMany({
    where: { isPublished: true, audience: { in: audiences } },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    include: { lessons: { orderBy: { order: 'asc' }, select: { id: true, title: true, durationSec: true, order: true } } },
  })
  const lessonIds = modules.flatMap(m => m.lessons.map(l => l.id))
  const progress = lessonIds.length ? await prisma.trainingProgress.findMany({ where: { userId: user.id, lessonId: { in: lessonIds } } }) : []
  const pMap = new Map(progress.map(p => [p.lessonId, p]))
  const coverIds = modules.map(m => m.coverAssetId).filter(Boolean) as string[]
  const covers = coverIds.length ? await prisma.mediaAsset.findMany({ where: { id: { in: coverIds } } }) : []
  const coverUrls = new Map<string, string>()
  for (const c of covers) coverUrls.set(c.id, await getFileUrl(c.cloud_storage_path, c.contentType, c.isPublic, 6 * 3600))

  return NextResponse.json({
    canManage,
    audiences,
    modules: modules.map(m => {
      const completed = m.lessons.filter(l => pMap.get(l.id)?.completed).length
      const totalSec = m.lessons.reduce((s, l) => s + (l.durationSec ?? 0), 0)
      const lastViewed = progress.filter(p => m.lessons.some(l => l.id === p.lessonId)).sort((a, b) => +b.updatedAt - +a.updatedAt)[0]
      return {
        id: m.id, slug: m.slug, title: m.title, description: m.description, audience: m.audience, level: m.level,
        lessonCount: m.lessons.length, completed, totalSec,
        coverUrl: m.coverAssetId ? coverUrls.get(m.coverAssetId) ?? null : null,
        resumeLessonId: lastViewed && !lastViewed.completed ? lastViewed.lessonId : null,
        pct: m.lessons.length ? Math.round((completed / m.lessons.length) * 100) : 0,
      }
    }),
  })
}
