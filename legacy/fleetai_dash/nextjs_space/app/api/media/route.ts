export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { withAudit } from '@/lib/audit'
import { generatePresignedUploadUrl, resolveStorage } from '@/lib/storage'
import { MAX_FILE_SIZE, MAX_SINGLE_PART, MEDIA_KINDS, kindFromContentType, requireMediaManager } from '@/lib/media'

/** List media assets (any signed-in user; management actions are gated separately). */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const kind = url.searchParams.get('kind')
  const folder = url.searchParams.get('folder')
  const q = url.searchParams.get('q')?.trim()
  const take = Math.min(200, Math.max(1, Number(url.searchParams.get('take') ?? 100)))
  const where: any = {}
  if (kind && (MEDIA_KINDS as readonly string[]).includes(kind)) where.kind = kind
  if (folder) where.folder = folder
  if (q) where.OR = [{ title: { contains: q, mode: 'insensitive' } }, { fileName: { contains: q, mode: 'insensitive' } }]
  const [items, total, byKind, { backend }] = await Promise.all([
    prisma.mediaAsset.findMany({ where, orderBy: { createdAt: 'desc' }, take }),
    prisma.mediaAsset.count(),
    prisma.mediaAsset.groupBy({ by: ['kind'], _count: { _all: true }, _sum: { size: true } }),
    resolveStorage(),
  ])
  const uploaderIds = Array.from(new Set(items.map(i => i.uploadedById).filter(Boolean))) as string[]
  const users = uploaderIds.length ? await prisma.user.findMany({ where: { id: { in: uploaderIds } }, select: { id: true, name: true, email: true } }) : []
  const uMap = new Map(users.map(u => [u.id, u]))
  return NextResponse.json({
    items: items.map(i => ({ ...i, uploadedBy: i.uploadedById ? uMap.get(i.uploadedById) ?? null : null })),
    total,
    byKind: byKind.map(k => ({ kind: k.kind, count: k._count._all, bytes: k._sum.size ?? 0 })),
    backend,
  })
}

/**
 * Step 1 of an upload: returns a presigned PUT URL (≤100 MB). Larger files must use /api/media/multipart/*.
 * Step 2 is POST /api/media/complete which records the MediaAsset row.
 */
export const POST = withAudit(async (req: Request) => {
  const user = await requireMediaManager()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const fileName = String(body.fileName ?? '').trim()
  const contentType = String(body.contentType ?? 'application/octet-stream')
  const size = Number(body.size ?? 0)
  const isPublic = !!body.isPublic
  const folder = String(body.folder ?? 'media').replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'media'
  if (!fileName) return NextResponse.json({ error: 'fileName is required' }, { status: 400 })
  if (!Number.isFinite(size) || size <= 0) return NextResponse.json({ error: 'size is required' }, { status: 400 })
  if (size > MAX_FILE_SIZE) return NextResponse.json({ error: 'File exceeds the 5 GB limit' }, { status: 413 })
  if (size > MAX_SINGLE_PART) return NextResponse.json({ error: 'Use multipart upload for files larger than 100 MB', multipart: true }, { status: 400 })
  const { uploadUrl, cloud_storage_path } = await generatePresignedUploadUrl(fileName, contentType, isPublic, folder)
  return NextResponse.json({ uploadUrl, cloud_storage_path, kind: kindFromContentType(contentType, fileName) })
}, { entity: 'media', verbs: { POST: 'presign_upload' } })
