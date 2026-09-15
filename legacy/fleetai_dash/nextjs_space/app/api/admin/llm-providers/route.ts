export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/admin'
import { testProvider, toResolved, maskProvider } from '@/lib/llm'
import { withAudit } from '@/lib/audit'

export async function GET() {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const providers = await prisma.llmProvider.findMany({ orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] })
  return NextResponse.json(providers.map(maskProvider))
}

async function _POST(request: Request) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await request.json().catch(() => ({}))

  // Ad-hoc connectivity test without saving: { test: true, ... }
  if (body?.test) {
    try {
      const r = await testProvider(toResolved({
        id: 'test', name: body.name || 'Provider', kind: body.kind, baseUrl: String(body.baseUrl ?? ''), apiKey: body.apiKey || null, model: String(body.model ?? ''),
      }))
      return NextResponse.json(r)
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message ?? 'Test failed' })
    }
  }

  const name = String(body?.name ?? '').trim()
  const baseUrl = String(body?.baseUrl ?? '').trim().replace(/\/$/, '')
  const model = String(body?.model ?? '').trim()
  const kind = body?.kind === 'anthropic' ? 'anthropic' : 'openai'
  if (!name || !/^https?:\/\//i.test(baseUrl) || !model) return NextResponse.json({ error: 'Name, base URL and model are required' }, { status: 400 })
  const count = await prisma.llmProvider.count()
  const isDefault = !!body?.isDefault || count === 0
  if (isDefault) await prisma.llmProvider.updateMany({ data: { isDefault: false } })
  const provider = await prisma.llmProvider.create({
    data: {
      name, baseUrl, model, kind, isDefault,
      apiKey: typeof body?.apiKey === 'string' && body.apiKey ? body.apiKey : null,
      isActive: body?.isActive !== false,
      notes: typeof body?.notes === 'string' ? body.notes.slice(0, 300) : null,
    },
  })
  return NextResponse.json(maskProvider(provider), { status: 201 })
}

export const POST = withAudit(_POST, { entity: 'llm_provider' })
