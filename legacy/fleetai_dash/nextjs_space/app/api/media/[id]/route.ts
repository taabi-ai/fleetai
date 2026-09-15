export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { withAudit } from '@/lib/audit'
import { deleteFile, getFileUrl } from '@/lib/storage'
import { requireMediaManager } from '@/lib/media'

type Ctx = { params: Promise<{ id: string }> }

/** Resolve a playable / downloadable URL (signed for private objects). */
export async function GET(req: Request, ctx: Ctx) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const asset = await prisma.mediaAsset.findUnique({ where: { id } })
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const url = await getFileUrl(asset.cloud_storage_path, asset.contentType, asset.isPublic, 3600)
  return NextResponse.json({ asset, url, expiresIn: asset.isPublic ? null : 3600 })
}

export const PATCH = withAudit(async (req: Request, ctx: Ctx) => {
  const user = await requireMediaManager()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const data: any = {}
  if (typeof body.title === 'string') data.title = body.title.trim().slice(0, 200)
  if (typeof body.folder === 'string') data.folder = body.folder.replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'media'
  if (body.durationSec != null) data.durationSec = Math.round(Number(body.durationSec))
  if (typeof body.kind === 'string') data.kind = body.kind
  const asset = await prisma.mediaAsset.update({ where: { id }, data })
  return NextResponse.json({ asset })
}, { entity: 'media' })

export const DELETE = withAudit(async (_req: Request, ctx: Ctx) => {
  const user = await requireMediaManager()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await ctx.params
  const asset = await prisma.mediaAsset.findUnique({ where: { id } })
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const lessons = await prisma.trainingLesson.count({ where: { videoAssetId: id } })
  if (lessons > 0) return NextResponse.json({ error: `This asset is used by ${lessons} training lesson(s). Detach it first.` }, { status: 409 })
  try { await deleteFile(asset.cloud_storage_path) } catch { /* object may already be gone */ }
  await prisma.trainingModule.updateMany({ where: { coverAssetId: id }, data: { coverAssetId: null } })
  await prisma.mediaAsset.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}, { entity: 'media' })
