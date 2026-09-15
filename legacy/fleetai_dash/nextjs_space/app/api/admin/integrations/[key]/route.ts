export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/admin'
import { integrationDef, mergeConfig, publicView, testIntegration, type IntegrationConfig } from '@/lib/integrations'
import { withAudit } from '@/lib/audit'

type Ctx = { params: Promise<{ key: string }> }

/** Save config + enabled flag. Blank secret fields keep the stored value. */
async function _PUT(request: Request, { params }: Ctx) {
  const session = await requireSuperAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { key } = await params
  const def = integrationDef(key)
  if (!def) return NextResponse.json({ error: 'Unknown integration' }, { status: 404 })
  const body = await request.json().catch(() => ({}))
  const existing = await prisma.integrationSetting.findUnique({ where: { key } })
  const config = mergeConfig(def, (existing?.config as IntegrationConfig) ?? {}, body?.config ?? {})
  const enabled = typeof body?.enabled === 'boolean' ? body.enabled : existing?.enabled ?? false
  if (enabled) {
    const missing = def.fields.filter(f => f.required && !config[f.key]).map(f => f.label)
    if (missing.length) return NextResponse.json({ error: `Cannot enable: missing ${missing.join(', ')}` }, { status: 400 })
  }
  const row = await prisma.integrationSetting.upsert({
    where: { key },
    update: { config, enabled, updatedById: session.user.id },
    create: { key, config, enabled, updatedById: session.user.id },
  })
  return NextResponse.json(publicView(def, { enabled: row.enabled, config: row.config as IntegrationConfig, updatedAt: row.updatedAt }))
}

/** Test connectivity using stored config merged with any unsaved values from the form. */
async function _POST(request: Request, { params }: Ctx) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { key } = await params
  const def = integrationDef(key)
  if (!def) return NextResponse.json({ error: 'Unknown integration' }, { status: 404 })
  if (!def.testable) return NextResponse.json({ ok: false, message: 'This integration has no connectivity test.' })
  const body = await request.json().catch(() => ({}))
  const existing = await prisma.integrationSetting.findUnique({ where: { key } })
  const config = mergeConfig(def, (existing?.config as IntegrationConfig) ?? {}, body?.config ?? {})
  const missing = def.fields.filter(f => f.required && !config[f.key]).map(f => f.label)
  if (missing.length) return NextResponse.json({ ok: false, message: `Missing ${missing.join(', ')}` })
  return NextResponse.json(await testIntegration(key, config))
}

async function _DELETE(_request: Request, { params }: Ctx) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { key } = await params
  if (!integrationDef(key)) return NextResponse.json({ error: 'Unknown integration' }, { status: 404 })
  await prisma.integrationSetting.deleteMany({ where: { key } })
  return NextResponse.json({ ok: true })
}

export const PUT = withAudit(_PUT, { entity: 'integration', verbs: { PUT: 'update' } })
export const POST = withAudit(_POST, { entity: 'integration', verbs: { POST: 'test' } })
export const DELETE = withAudit(_DELETE, { entity: 'integration', verbs: { DELETE: 'delete' } })
