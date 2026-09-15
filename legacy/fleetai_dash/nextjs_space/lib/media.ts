import { prisma } from '@/lib/db'
import { auth } from '@/auth'
import { roleHas } from '@/lib/rbac'
import { isSuperAdmin } from '@/lib/admin'

export const MEDIA_KINDS = ['video', 'image', 'document', 'audio', 'other'] as const
export type MediaKind = (typeof MEDIA_KINDS)[number]

export const MAX_SINGLE_PART = 100 * 1024 * 1024 // 100 MB → presigned PUT; larger files use multipart
export const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024 // 5 GB

export function kindFromContentType(ct: string, fileName = ''): MediaKind {
  const t = (ct || '').toLowerCase()
  if (t.startsWith('video/')) return 'video'
  if (t.startsWith('image/')) return 'image'
  if (t.startsWith('audio/')) return 'audio'
  if (/pdf|msword|officedocument|text\/|csv|json|presentation|spreadsheet|markdown/.test(t)) return 'document'
  if (/\.(mp4|webm|mov|mkv)$/i.test(fileName)) return 'video'
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(fileName)) return 'image'
  if (/\.(pdf|docx?|xlsx?|pptx?|txt|md|csv)$/i.test(fileName)) return 'document'
  return 'other'
}

/** Who may upload / edit / delete media: super admins and roles with `media.manage`. */
export async function requireMediaManager() {
  const session = await auth()
  const user = session?.user
  if (!user?.id) return null
  if (isSuperAdmin(user.role) || (await roleHas(user.role, 'media.manage'))) return user
  return null
}

export async function getAsset(id: string) {
  return prisma.mediaAsset.findUnique({ where: { id } })
}

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}
