'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { GitBranch, Loader2, Rocket, Timer, AlertTriangle, Wrench, RefreshCw, ExternalLink, CheckCircle2, Circle } from 'lucide-react'
import { AppNav } from '@/components/app-nav'
import { PinSettingsDialog } from '@/components/pin-settings-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Metrics = { windowDays: number; deployments: number; failedDeployments: number; deploymentsPerWeek: number; leadTimeMin: number | null; changeFailureRate: number | null; mttrMin: number | null; incidentsOpened: number; incidentsResolved: number; services: string[] }
type Ev = { id: string; type: string; service: string; env: string; status: string; ref?: string | null; incidentId?: string | null; leadTimeMin?: number | null; occurredAt: string }
type Src = { configured: boolean; enabled: boolean; baseUrl?: string | null; workspace?: string | null }
type Data = { metrics: Metrics; bands: Record<string, string>; recent: Ev[]; total: number; sources: { webhook: Src; plane: Src; jira: Src } }
type PlaneProject = { id: string; name: string; identifier: string; description: string; totalMembers: number | null }

const BAND_CLS: Record<string, string> = { Elite: 'text-emerald-400 border-emerald-400/40', High: 'text-teal-300 border-teal-400/40', Medium: 'text-amber-400 border-amber-400/40', Low: 'text-red-400 border-red-400/40', 'n/a': 'text-muted-foreground border-white/10' }

function fmtMin(v: number | null) {
  if (v == null) return '—'
  if (v < 60) return `${v} min`
  if (v < 24 * 60) return `${(v / 60).toFixed(1)} h`
  return `${(v / 1440).toFixed(1)} d`
}

export function EngineeringClient({ canManage }: { canManage: boolean }) {
  const [pinOpen, setPinOpen] = useState(false)
  const [data, setData] = useState<Data | null>(null)
  const [plane, setPlane] = useState<{ enabled: boolean; projects: PlaneProject[]; error?: string; baseUrl?: string; workspace?: string } | null>(null)
  const [days, setDays] = useState('30')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [r1, r2] = await Promise.all([fetch(`/api/dora/events?days=${days}`), fetch('/api/engineering/plane')])
    if (r1.ok) setData(await r1.json())
    if (r2.ok) setPlane(await r2.json())
    setLoading(false)
  }, [days])
  useEffect(() => { void load() }, [load])

  const m = data?.metrics
  const b = data?.bands ?? {}

  return (
    <div className="min-h-screen bg-background">
      <AppNav onOpenPinSettings={() => setPinOpen(true)} />
      <PinSettingsDialog open={pinOpen} onOpenChange={setPinOpen} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-primary mb-1"><GitBranch className="w-5 h-5" /><span className="text-xs font-medium uppercase tracking-wider">Engineering</span></div>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-foreground">DORA metrics</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">Deployment frequency, lead time for changes, change-failure rate and time to restore — computed from events your CI/CD and monitoring push to the DORA webhook. Work items come from Plane.so (plane.taabi.co) or Jira.</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="h-9 w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>{['7', '30', '90', '180'].map(d => <SelectItem key={d} value={d}>Last {d} days</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-9" onClick={() => void load()} disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}</Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi icon={Rocket} label="Deployment frequency" value={m ? `${m.deploymentsPerWeek}/wk` : '—'} sub={m ? `${m.deployments} deploys in ${m.windowDays}d` : ''} band={b.frequency} />
          <Kpi icon={Timer} label="Lead time for changes" value={fmtMin(m?.leadTimeMin ?? null)} sub="commit → production (avg)" band={b.leadTime} />
          <Kpi icon={AlertTriangle} label="Change failure rate" value={m?.changeFailureRate != null ? `${Math.round(m.changeFailureRate * 100)}%` : '—'} sub={m ? `${m.failedDeployments} failed deploys` : ''} band={b.cfr} />
          <Kpi icon={Wrench} label="Time to restore (MTTR)" value={fmtMin(m?.mttrMin ?? null)} sub={m ? `${m.incidentsResolved}/${m.incidentsOpened} incidents resolved` : ''} band={b.mttr} />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <SourceCard title="DORA webhook" src={data?.sources.webhook} desc="POST /api/dora/events from GitHub Actions, GitLab CI, ArgoCD, New Relic alerts…" canManage={canManage} />
          <SourceCard title="Plane.so" src={data?.sources.plane} desc={data?.sources.plane.baseUrl ? `${data.sources.plane.baseUrl} · workspace ${data.sources.plane.workspace}` : 'plane.taabi.co work items → lead time & throughput'} canManage={canManage} />
          <SourceCard title="Jira (legacy)" src={data?.sources.jira} desc={data?.sources.jira.baseUrl ?? 'Kept for the migration period'} canManage={canManage} />
        </div>

        {plane?.enabled && (
          <section className="rounded-xl border border-white/10 bg-card/80 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium text-foreground">Plane.so projects</h2>
              {plane.baseUrl && <a className="text-xs text-primary inline-flex items-center gap-1 hover:underline" href={plane.baseUrl} target="_blank" rel="noreferrer">Open Plane <ExternalLink className="w-3 h-3" /></a>}
            </div>
            {plane.error ? <p className="text-xs text-red-400">{plane.error}</p> : plane.projects.length === 0 ? <p className="text-xs text-muted-foreground">No projects visible for this token.</p> : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {plane.projects.map(p => (
                  <div key={p.id} className="rounded-lg border border-white/10 p-3">
                    <div className="flex items-center gap-2"><Badge variant="outline" className="text-[10px] border-primary/40 text-primary">{p.identifier}</Badge><span className="text-sm font-medium text-foreground">{p.name}</span></div>
                    {p.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.description}</p>}
                    {p.totalMembers != null && <p className="text-[11px] text-muted-foreground mt-1">{p.totalMembers} members</p>}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <section className="rounded-xl border border-white/10 bg-card/80 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
            <h2 className="font-medium text-foreground">Recent events</h2>
            <span className="text-xs text-muted-foreground">{data?.total ?? 0} total</span>
          </div>
          {loading && !data ? (
            <div className="p-6 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
          ) : !data?.recent.length ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No events yet. {canManage ? <>Enable the <Link href="/admin/integrations#engineering" className="text-primary hover:underline">DORA webhook</Link> and send your first deployment event from CI.</> : 'Ask an engineering manager to connect the DORA webhook.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-muted-foreground border-b border-white/5"><th className="text-left p-3 font-medium">When</th><th className="text-left p-3 font-medium">Type</th><th className="text-left p-3 font-medium">Service / env</th><th className="text-left p-3 font-medium">Status</th><th className="text-left p-3 font-medium">Ref / incident</th><th className="text-right p-3 font-medium">Lead time</th></tr></thead>
                <tbody>
                  {data.recent.map(e => (
                    <tr key={e.id} className="border-b border-white/5">
                      <td className="p-3 text-muted-foreground whitespace-nowrap">{new Date(e.occurredAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</td>
                      <td className="p-3"><Badge variant="outline" className="text-[10px] border-white/10">{e.type.replace('_', ' ')}</Badge></td>
                      <td className="p-3 text-foreground">{e.service} <span className="text-muted-foreground">/ {e.env}</span></td>
                      <td className={`p-3 ${e.status === 'failed' ? 'text-red-400' : 'text-emerald-400'}`}>{e.status}</td>
                      <td className="p-3 font-mono text-muted-foreground truncate max-w-[200px]">{e.incidentId ?? e.ref ?? '—'}</td>
                      <td className="p-3 text-right font-mono">{e.leadTimeMin != null ? fmtMin(e.leadTimeMin) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

function Kpi({ icon: Icon, label, value, sub, band }: { icon: typeof Rocket; label: string; value: string; sub?: string; band?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-card/80 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5"><Icon className="w-3.5 h-3.5 text-primary" /> {label}</span>
        {band && <Badge variant="outline" className={`text-[10px] ${BAND_CLS[band] ?? ''}`}>{band}</Badge>}
      </div>
      <div className="font-mono text-2xl font-semibold text-foreground mt-2">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  )
}

function SourceCard({ title, src, desc, canManage }: { title: string; src?: Src; desc: string; canManage: boolean }) {
  const state = !src ? 'loading' : src.enabled ? 'enabled' : src.configured ? 'configured' : 'off'
  return (
    <div className="rounded-xl border border-white/10 bg-card/80 p-4 flex items-start gap-3">
      {state === 'enabled' ? <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" /> : <Circle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2"><span className="text-sm font-medium text-foreground">{title}</span>
          <Badge variant="outline" className={`text-[10px] ${state === 'enabled' ? 'border-emerald-400/40 text-emerald-400' : state === 'configured' ? 'border-amber-400/40 text-amber-400' : 'border-white/10 text-muted-foreground'}`}>{state === 'enabled' ? 'Connected' : state === 'configured' ? 'Configured · off' : state === 'loading' ? '…' : 'Not connected'}</Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1 truncate">{desc}</p>
        {canManage && <Link href="/admin/integrations#engineering" className="text-[11px] text-primary hover:underline">Configure →</Link>}
      </div>
    </div>
  )
}
