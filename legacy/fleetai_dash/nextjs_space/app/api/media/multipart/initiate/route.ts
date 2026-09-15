export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { withAudit } from '@/lib/audit'
import { initiateMultipartUpload } from '@/lib/storage'
import { MAX_FILE_SIZE, requireMediaManager } from '@/lib/media'

export const POST = withAudit(async (req: Request) => {
  const user = await requireMediaManager()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const fileName = String(body.fileName ?? '').trim()
  const contentType = String(body.contentType ?? 'application/octet-stream')
  const size = Number(body.size ?? 0)
  const folder = String(body.folder ?? 'media').replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'media'
  if (!fileName) return NextResponse.json({ error: 'fileName is required' }, { status: 400 })
  if (size > MAX_FILE_SIZE) return NextResponse.json({ error: 'File exceeds the 5 GB limit' }, { status: 413 })
  const res = await initiateMultipartUpload(fileName, contentType, !!body.isPublic, folder)
  return NextResponse.json(res)
}, { entity: 'media', verbs: { POST: 'multipart_initiate' } })
