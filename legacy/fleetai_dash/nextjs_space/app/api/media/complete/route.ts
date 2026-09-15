export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAudit } from '@/lib/audit'
import { MEDIA_KINDS, kindFromContentType, requireMediaManager } from '@/lib/media'

/** Records a MediaAsset after the browser finished uploading to the presigned URL. */
export const POST = withAudit(async (req: Request) => {
  const user = await requireMediaManager()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const cloud_storage_path = String(body.cloud_storage_path ?? '')
  const fileName = String(body.fileName ?? '').trim()
  const contentType = String(body.contentType ?? 'application/octet-stream')
  const size = Number(body.size ?? 0)
  if (!cloud_storage_path || !fileName) return NextResponse.json({ error: 'cloud_storage_path and fileName are required' }, { status: 400 })
  const kind = (MEDIA_KINDS as readonly string[]).includes(body.kind) ? body.kind : kindFromContentType(contentType, fileName)
  const asset = await prisma.mediaAsset.upsert({
    where: { cloud_storage_path },
    update: { title: String(body.title ?? fileName).slice(0, 200), size, contentType, kind, durationSec: body.durationSec != null ? Math.round(Number(body.durationSec)) : undefined },
    create: {
      cloud_storage_path,
      fileName,
      contentType,
      size,
      kind,
      title: String(body.title ?? fileName).slice(0, 200),
      isPublic: !!body.isPublic,
      folder: String(body.folder ?? 'media').replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'media',
      durationSec: body.durationSec != null && Number.isFinite(Number(body.durationSec)) ? Math.round(Number(body.durationSec)) : null,
      uploadedById: user.id,
    },
  })
  return NextResponse.json({ asset })
}, { entity: 'media', verbs: { POST: 'upload' } })
