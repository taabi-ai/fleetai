import { prisma } from '@/lib/db'
import { roleHas } from '@/lib/rbac'
import { isSuperAdmin } from '@/lib/admin'
import { getFileUrl } from '@/lib/storage'

export const AUDIENCES = ['customer', 'internal', 'both'] as const
export const LEVELS = ['beginner', 'intermediate', 'advanced'] as const
export type Audience = (typeof AUDIENCES)[number]

export type Chapter = { title: string; startSec: number }

export function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'module'
}

/** Audiences a role may watch. Customers (plain `user`) only see customer modules. */
export async function audiencesFor(role: string | null | undefined): Promise<Audience[]> {
  if (isSuperAdmin(role) || (await roleHas(role, 'training.internal'))) return ['customer', 'internal', 'both']
  return ['customer', 'both']
}

export async function canManageTraining(role: string | null | undefined) {
  return isSuperAdmin(role) || roleHas(role, 'training.manage')
}

export function normalizeChapters(input: unknown): Chapter[] {
  if (!Array.isArray(input)) return []
  return input
    .map((c: any) => ({ title: String(c?.title ?? '').trim().slice(0, 120), startSec: Math.max(0, Math.round(Number(c?.startSec ?? 0))) }))
    .filter(c => c.title)
    .sort((a, b) => a.startSec - b.startSec)
}

/** Resolve the playable URL for a lesson: uploaded asset (signed if private) or an external URL. */
export async function lessonVideoUrl(lesson: { videoAssetId: string | null; videoUrl: string | null }) {
  if (lesson.videoAssetId) {
    const asset = await prisma.mediaAsset.findUnique({ where: { id: lesson.videoAssetId } })
    if (asset) return { url: await getFileUrl(asset.cloud_storage_path, asset.contentType, asset.isPublic, 6 * 3600), contentType: asset.contentType, asset }
  }
  if (lesson.videoUrl) return { url: lesson.videoUrl, contentType: null, asset: null }
  return { url: null, contentType: null, asset: null }
}
