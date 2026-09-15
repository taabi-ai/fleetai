export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { withAudit } from '@/lib/audit'
import { abortMultipartUpload, completeMultipartUpload } from '@/lib/storage'
import { requireMediaManager } from '@/lib/media'

export const POST = withAudit(async (req: Request) => {
  const user = await requireMediaManager()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const { cloud_storage_path, uploadId, parts, abort } = body
  if (!cloud_storage_path || !uploadId) return NextResponse.json({ error: 'cloud_storage_path and uploadId are required' }, { status: 400 })
  if (abort) {
    await abortMultipartUpload(String(cloud_storage_path), String(uploadId))
    return NextResponse.json({ ok: true, aborted: true })
  }
  if (!Array.isArray(parts) || parts.length === 0) return NextResponse.json({ error: 'parts are required' }, { status: 400 })
  await completeMultipartUpload(String(cloud_storage_path), String(uploadId), parts.map((p: any) => ({ ETag: String(p.ETag), PartNumber: Number(p.PartNumber) })))
  return NextResponse.json({ ok: true })
}, { entity: 'media', verbs: { POST: 'multipart_complete' } })
