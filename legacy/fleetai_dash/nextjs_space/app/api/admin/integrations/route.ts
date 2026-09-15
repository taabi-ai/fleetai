export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/admin'
import { INTEGRATIONS, publicView, type IntegrationConfig } from '@/lib/integrations'

export async function GET() {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const rows = await prisma.integrationSetting.findMany()
  const byKey = new Map(rows.map(r => [r.key, { enabled: r.enabled, config: (r.config as IntegrationConfig) ?? {}, updatedAt: r.updatedAt }]))
  return NextResponse.json({
    integrations: INTEGRATIONS.map(def => ({ def, state: publicView(def, byKey.get(def.key) ?? null) })),
  })
}
