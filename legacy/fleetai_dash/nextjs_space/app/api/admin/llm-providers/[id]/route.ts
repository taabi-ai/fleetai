export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/admin'
import { maskProvider, testProvider, toResolved } from '@/lib/llm'
import { withAudit } from '@/lib/audit'

async function _PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const data: Record<string, unknown> = {}
  if (typeof body?.name === 'string' && body.name.trim()) data.name = body.name.trim()
  if (typeof body?.baseUrl === 'string') {
    const u = body.baseUrl.trim().replace(/\/$/, '')
    if (!/^https?:\/\//i.test(u)) return NextResponse.json({ error: 'Invalid base URL' }, { status: 400 })
    data.baseUrl = u
  }
  if (typeof body?.model === 'string' && body.model.trim()) data.model = body.model.trim()
  if (body?.kind === 'openai' || body?.kind === 'anthropic') data.kind = body.kind
  if (typeof body?.apiKey === 'string' && body.apiKey) data.apiKey = body.apiKey
  if (body?.clearKey) data.apiKey = null
  if (typeof body?.isActive === 'boolean') data.isActive = body.isActive
  if (typeof body?.notes === 'string') data.notes = body.notes.slice(0, 300) || null
  if (body?.isDefault === true) {
    await prisma.llmProvider.updateMany({ data: { isDefault: false } })
    data.isDefault = true
    data.isActive = true
  }
  const provider = await prisma.llmProvider.update({ where: { id }, data })
  return NextResponse.json(maskProvider(provider))
}

async function _DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const exists = await prisma.llmProvider.findUnique({ where: { id }, select: { id: true } })
  if (!exists) return NextResponse.json({ error: 'LLM provider not found' }, { status: 404 })
  await prisma.llmProvider.delete({ where: { id } })
  return NextResponse.json({ success: true })
}

// POST - test a saved provider
async function _POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const provider = await prisma.llmProvider.findUnique({ where: { id } })
  if (!provider) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    return NextResponse.json(await testProvider(toResolved(provider)))
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Test failed' })
  }
}

export const PATCH = withAudit(_PATCH, { entity: 'llm_provider' })
export const DELETE = withAudit(_DELETE, { entity: 'llm_provider' })
export const POST = withAudit(_POST, { entity: 'llm_provider', verbs: { POST: 'test' } })
