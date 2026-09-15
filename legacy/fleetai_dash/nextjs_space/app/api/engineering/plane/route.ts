export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { getIntegration } from '@/lib/integrations'
import { requirePermission } from '@/lib/rbac'

/** Lists Plane.so projects for the configured workspace (server-side proxy; token never leaves the server). */
export async function GET() {
  if (!(await requirePermission('dora.view'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const cfg = await getIntegration('plane')
  if (!cfg?.enabled || !cfg.config.apiKey || !cfg.config.baseUrl || !cfg.config.workspaceSlug) {
    return NextResponse.json({ enabled: false, projects: [] })
  }
  const base = cfg.config.baseUrl.replace(/\/$/, '')
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 10_000)
  try {
    const res = await fetch(`${base}/api/v1/workspaces/${encodeURIComponent(cfg.config.workspaceSlug)}/projects/`, {
      headers: { 'X-API-Key': cfg.config.apiKey, Accept: 'application/json' }, signal: ctl.signal, cache: 'no-store',
    })
    if (!res.ok) return NextResponse.json({ enabled: true, error: `Plane responded ${res.status}`, projects: [] })
    const data = await res.json().catch(() => ({}))
    const list: any[] = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : []
    const wanted = (cfg.config.projectIds ?? '').split(',').map(s => s.trim()).filter(Boolean)
    const projects = list
      .filter(p => !wanted.length || wanted.includes(p.id))
      .map(p => ({ id: p.id, name: p.name, identifier: p.identifier, description: p.description ?? '', totalMembers: p.total_members ?? null, updatedAt: p.updated_at ?? null }))
    return NextResponse.json({ enabled: true, workspace: cfg.config.workspaceSlug, baseUrl: base, projects })
  } catch (e) {
    return NextResponse.json({ enabled: true, error: e instanceof Error ? e.message : 'Plane request failed', projects: [] })
  } finally {
    clearTimeout(timer)
  }
}
