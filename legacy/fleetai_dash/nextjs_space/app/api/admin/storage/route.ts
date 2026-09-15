export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/admin'
import { withAudit } from '@/lib/audit'
import { invalidateStorageCache, resolveStorage, testStorage } from '@/lib/storage'

export async function GET() {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { backend } = await resolveStorage()
  return NextResponse.json({ backend })
}

/** Connectivity test of the configured object storage backend. */
export const POST = withAudit(async () => {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  invalidateStorageCache()
  const result = await testStorage()
  return NextResponse.json(result)
}, { entity: 'storage', verbs: { POST: 'test_connection' } })
