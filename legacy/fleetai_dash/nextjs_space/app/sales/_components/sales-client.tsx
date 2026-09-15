'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Briefcase, Loader2, Users, Target, Megaphone, UserCheck, Link2, CheckCircle2, Circle, Info } from 'lucide-react'
import { AppNav } from '@/components/app-nav'
import { PinSettingsDialog } from '@/components/pin-settings-dialog'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type Kam = { name: string; accounts: number; onboarded: number; onboardingPct: number; arrLakh: number; nps: number; churnRisk: number; onboardedDaysAgo: number }
type Rep = { name: string; leads: number; qualified: number; won: number; winRate: number; pipelineLakh: number; quotaPct: number; tenureMonths: number }
type Mkt = { channel: string; leads: number; mql: number; mqlPct: number; cplInr: number; spendLakh: number }
type Data = {
  sample: boolean
  sources: { crm: { configured: boolean; enabled: boolean; baseUrl: string | null }; mcp: { id: string; name: string; url: string; category: string; description?: string | null }[] }
  totals: { leads: number; customers: number; onboarded: number; pipelineLakh: number }
  kams: Kam[]; sales: Rep[]; marketing: Mkt[]; funnel: { stage: string; count: number }[]
}

export function SalesClient({ canManage }: { canManage: boolean }) {
  const [pinOpen, setPinOpen] = useState(false)
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/sales/overview').then(async r => { if (r.ok && !cancelled) setData(await r.json()) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const crmConnected = !!data?.sources.crm.enabled || (data?.sources.mcp.some(m => m.category === 'crm') ?? false)

  return (
    <div className="min-h-screen bg-background">
      <AppNav onOpenPinSettings={() => setPinOpen(true)} />
      <PinSettingsDialog open={pinOpen} onOpenChange={setPinOpen} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-primary mb-1"><Briefcase className="w-5 h-5" /><span className="text-xs font-medium uppercase tracking-wider">Sales &amp; CRM</span></div>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-foreground">Sales, CRM &amp; team performance</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">Key-account managers, sales persons and marketing channels linked to their leads, customers and onboarding progress. Once the Taabi CRM MCP server (crm.taabi.ai) is registered, these scorecards switch from sample data to live CRM data.</p>
          </div>
          <div className="flex flex-col items-end gap-1 text-xs">
            <span className="inline-flex items-center gap-1.5">{crmConnected ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Circle className="w-3.5 h-3.5 text-muted-foreground" />} CRM {crmConnected ? 'connected' : 'not connected'}</span>
            {canManage && <Link href="/admin/mcp-servers" className="text-primary hover:underline inline-flex items-center gap-1"><Link2 className="w-3 h-3" /> Register CRM / DTWIN MCP</Link>}
          </div>
        </div>

        {data?.sample && (
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-amber-300 flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span><span className="font-medium">Sample data.</span> Figures below are illustrative placeholders so the layout can be reviewed. They are replaced by live CRM data when a CRM-category MCP server or the CRM REST integration is enabled{canManage ? <> in <Link href="/admin/integrations#sales-crm" className="underline">Admin → Integrations</Link></> : ''}.</span>
          </div>
        )}

        {loading && !data ? (
          <div className="p-6 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
        ) : data && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi icon={Target} label="Leads (90d)" value={data.totals.leads.toLocaleString('en-IN')} />
              <Kpi icon={Users} label="Customers under KAM" value={data.totals.customers.toLocaleString('en-IN')} />
              <Kpi icon={UserCheck} label="Onboarded" value={`${data.totals.onboarded} · ${Math.round((data.totals.onboarded / Math.max(1, data.totals.customers)) * 100)}%`} />
              <Kpi icon={Briefcase} label="Open pipeline" value={`₹${data.totals.pipelineLakh} L`} />
            </div>

            <Tabs defaultValue="kam">
              <TabsList>
                <TabsTrigger value="kam">KAM performance</TabsTrigger>
                <TabsTrigger value="sales">Sales persons</TabsTrigger>
                <TabsTrigger value="marketing">Marketing</TabsTrigger>
                <TabsTrigger value="funnel">Leads funnel</TabsTrigger>
                <TabsTrigger value="sources">Data sources</TabsTrigger>
              </TabsList>

              <TabsContent value="kam">
                <Table head={['KAM', 'Accounts', 'Onboarded', 'Onboarding %', 'ARR (₹ L)', 'NPS', 'Churn risk', 'Joined']}>
                  {data.kams.map(k => (
                    <tr key={k.name} className="border-t border-white/5">
                      <td className="p-3 text-foreground font-medium">{k.name}</td><td className="p-3">{k.accounts}</td><td className="p-3">{k.onboarded}</td>
                      <td className="p-3"><Bar pct={k.onboardingPct} /></td><td className="p-3 font-mono">{k.arrLakh}</td><td className="p-3">{k.nps}</td>
                      <td className="p-3">{k.churnRisk ? <Badge variant="outline" className="text-[10px] border-red-400/40 text-red-400">{k.churnRisk} at risk</Badge> : <span className="text-emerald-400 text-xs">none</span>}</td>
                      <td className="p-3 text-muted-foreground">{Math.round(k.onboardedDaysAgo / 30)} mo ago</td>
                    </tr>
                  ))}
                </Table>
              </TabsContent>

              <TabsContent value="sales">
                <Table head={['Sales person', 'Leads', 'Qualified', 'Won', 'Win rate', 'Pipeline (₹ L)', 'Quota attainment', 'Tenure']}>
                  {data.sales.map(s => (
                    <tr key={s.name} className="border-t border-white/5">
                      <td className="p-3 text-foreground font-medium">{s.name}</td><td className="p-3">{s.leads}</td><td className="p-3">{s.qualified}</td><td className="p-3">{s.won}</td>
                      <td className="p-3">{s.winRate}%</td><td className="p-3 font-mono">{s.pipelineLakh}</td><td className="p-3"><Bar pct={Math.min(100, s.quotaPct)} label={`${s.quotaPct}%`} /></td>
                      <td className="p-3 text-muted-foreground">{s.tenureMonths} mo</td>
                    </tr>
                  ))}
                </Table>
              </TabsContent>

              <TabsContent value="marketing">
                <Table head={['Channel', 'Leads', 'MQL', 'MQL %', 'Cost / lead (₹)', 'Spend (₹ L)']}>
                  {data.marketing.map(m => (
                    <tr key={m.channel} className="border-t border-white/5">
                      <td className="p-3 text-foreground font-medium inline-flex items-center gap-1.5"><Megaphone className="w-3.5 h-3.5 text-primary" /> {m.channel}</td><td className="p-3">{m.leads}</td><td className="p-3">{m.mql}</td>
                      <td className="p-3"><Bar pct={m.mqlPct} /></td><td className="p-3 font-mono">{m.cplInr.toLocaleString('en-IN')}</td><td className="p-3 font-mono">{m.spendLakh}</td>
                    </tr>
                  ))}
                </Table>
              </TabsContent>

              <TabsContent value="funnel">
                <div className="rounded-xl border border-white/10 bg-card/80 p-5 space-y-2">
                  {data.funnel.map((f, i) => {
                    const max = data.funnel[0]?.count ?? 1
                    return (
                      <div key={f.stage} className="flex items-center gap-3 text-xs">
                        <span className="w-28 text-muted-foreground">{f.stage}</span>
                        <div className="flex-1 h-6 rounded bg-white/5 overflow-hidden"><div className="h-full bg-primary/70" style={{ width: `${Math.max(4, (f.count / max) * 100)}%`, opacity: 1 - i * 0.1 }} /></div>
                        <span className="w-12 text-right font-mono text-foreground">{f.count}</span>
                      </div>
                    )
                  })}
                </div>
              </TabsContent>

              <TabsContent value="sources">
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-card/80 p-4">
                    <div className="flex items-center gap-2 mb-1"><span className="text-sm font-medium text-foreground">Taabi CRM REST</span><Badge variant="outline" className={`text-[10px] ${data.sources.crm.enabled ? 'border-emerald-400/40 text-emerald-400' : 'border-white/10 text-muted-foreground'}`}>{data.sources.crm.enabled ? 'Enabled' : data.sources.crm.configured ? 'Configured · off' : 'Not configured'}</Badge></div>
                    <p className="text-xs text-muted-foreground">{data.sources.crm.baseUrl ?? 'https://crm.taabi.ai — configure in Admin → Integrations.'}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-card/80 p-4">
                    <div className="text-sm font-medium text-foreground mb-2">CRM / DTWIN MCP servers</div>
                    {data.sources.mcp.length === 0 ? <p className="text-xs text-muted-foreground">None registered yet. Add your CRM MCP and DTWIN services MCP under Admin → MCP servers with the matching category.</p> : (
                      <ul className="space-y-1.5">{data.sources.mcp.map(m => <li key={m.id} className="text-xs flex items-center gap-2"><Badge variant="outline" className="text-[10px] uppercase border-primary/40 text-primary">{m.category}</Badge><span className="text-foreground">{m.name}</span><span className="font-mono text-muted-foreground truncate">{m.url}</span></li>)}</ul>
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  )
}

function Kpi({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-card/80 p-4">
      <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5"><Icon className="w-3.5 h-3.5 text-primary" /> {label}</span>
      <div className="font-mono text-2xl font-semibold text-foreground mt-2">{value}</div>
    </div>
  )
}

function Bar({ pct, label }: { pct: number; label?: string }) {
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 rounded bg-white/10 overflow-hidden"><div className={`h-full ${pct >= 75 ? 'bg-emerald-400' : pct >= 40 ? 'bg-primary' : 'bg-red-400'}`} style={{ width: `${pct}%` }} /></div>
      <span className="text-[11px] font-mono w-10 text-right">{label ?? `${pct}%`}</span>
    </div>
  )
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-card/80 overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr className="text-muted-foreground">{head.map(h => <th key={h} className="text-left p-3 font-medium whitespace-nowrap">{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}
