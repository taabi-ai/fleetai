export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getPresignedUrlForPart } from '@/lib/storage'
import { requireMediaManager } from '@/lib/media'

/** Not audited individually (one entry per 100 MB chunk would flood the log); initiate/complete are audited. */
export async function POST(req: Request) {
  const user = await requireMediaManager()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const { cloud_storage_path, uploadId, partNumber } = body
  if (!cloud_storage_path || !uploadId || !partNumber) return NextResponse.json({ error: 'cloud_storage_path, uploadId and partNumber are required' }, { status: 400 })
  const url = await getPresignedUrlForPart(String(cloud_storage_path), String(uploadId), Number(partNumber))
  return NextResponse.json({ url })
}
