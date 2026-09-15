'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Users, LayoutDashboard, Boxes, Link2, Cpu, Bell, Mail, Server, ArrowRight } from 'lucide-react'
import { PageHeader, Panel } from './_components/ui-bits'

type Sys = {
  counts: { users: number; dashboards: number; widgets: number; mcpServers: number; llmProviders: number; notifications: number }
  smtpConfigured: boolean
  smtpHost?: string | null
  activeProvider: { name: string; model: string; kind: string }
  server: { node: string; platform: string; uptimeSec: number; memoryMb: number; env?: string; appUrl?: string | null }
}

export default function AdminOverview() {
  const [sys, setSys] = useState<Sys | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/system').then(async r => { if (!r.ok) throw new Error('Failed to load'); setSys(await r.json()) }).catch(e => setErr(e.message))
  }, [])

  const stat = (icon: React.ReactNode, label: string, value: React.ReactNode, href?: string) => (
    <Panel className="p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="font-mono text-lg text-foreground truncate">{value}</div>
      </div>
      {href && <Link href={href} className="text-muted-foreground hover:text-primary"><ArrowRight className="w-4 h-4" /></Link>}
    </Panel>
  )

  return (
    <div>
      <PageHeader title="Overview" description="System status at a glance. Manage users, MCP servers, LLM providers, email delivery and menus from the sections on the left." />
      {err && <p className="text-xs text-destructive mb-4">{err}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {stat(<Users className="w-4 h-4" />, 'Users', sys?.counts.users ?? '—', '/admin/users')}
        {stat(<LayoutDashboard className="w-4 h-4" />, 'Dashboards', sys?.counts.dashboards ?? '—')}
        {stat(<Boxes className="w-4 h-4" />, 'Widgets', sys?.counts.widgets ?? '—')}
        {stat(<Link2 className="w-4 h-4" />, 'MCP servers', sys?.counts.mcpServers ?? '—', '/admin/mcp-servers')}
        {stat(<Cpu className="w-4 h-4" />, 'LLM providers', sys?.counts.llmProviders ?? '—', '/admin/llm-providers')}
        {stat(<Bell className="w-4 h-4" />, 'Notifications sent', sys?.counts.notifications ?? '—')}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
        <Panel className="p-4">
          <div className="flex items-center gap-2 text-xs font-semibold mb-3"><Cpu className="w-3.5 h-3.5 text-primary" /> Active AI provider</div>
          {sys ? (
            <div className="text-xs space-y-1">
              <div><span className="text-muted-foreground">Provider:</span> <span className="text-foreground">{sys.activeProvider.name}</span></div>
              <div><span className="text-muted-foreground">Model:</span> <span className="font-mono">{sys.activeProvider.model}</span></div>
              <div><span className="text-muted-foreground">API style:</span> {sys.activeProvider.kind}</div>
              <Link href="/admin/llm-providers" className="inline-flex items-center gap-1 text-primary hover:underline pt-1">Manage providers <ArrowRight className="w-3 h-3" /></Link>
            </div>
          ) : <div className="text-xs text-muted-foreground">Loading…</div>}
        </Panel>
        <Panel className="p-4">
          <div className="flex items-center gap-2 text-xs font-semibold mb-3"><Mail className="w-3.5 h-3.5 text-primary" /> Email delivery</div>
          {sys ? (
            <div className="text-xs space-y-1">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${sys.smtpConfigured ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                {sys.smtpConfigured ? <>SMTP configured via <span className="font-mono">{sys.smtpHost}</span></> : 'SMTP not configured — notifications are in-app only'}
              </div>
              <Link href="/admin/smtp" className="inline-flex items-center gap-1 text-primary hover:underline pt-1">Configure SMTP <ArrowRight className="w-3 h-3" /></Link>
            </div>
          ) : <div className="text-xs text-muted-foreground">Loading…</div>}
        </Panel>
        <Panel className="p-4 lg:col-span-2">
          <div className="flex items-center gap-2 text-xs font-semibold mb-3"><Server className="w-3.5 h-3.5 text-primary" /> Server</div>
          {sys ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div><div className="text-muted-foreground">Runtime</div><div className="font-mono">{sys.server.node}</div></div>
              <div><div className="text-muted-foreground">Environment</div><div className="font-mono">{sys.server.env}</div></div>
              <div><div className="text-muted-foreground">Uptime</div><div className="font-mono">{Math.floor(sys.server.uptimeSec / 3600)}h {Math.floor((sys.server.uptimeSec % 3600) / 60)}m</div></div>
              <div><div className="text-muted-foreground">Memory (RSS)</div><div className="font-mono">{sys.server.memoryMb} MB</div></div>
              {sys.server.appUrl && <div className="col-span-2 md:col-span-4"><div className="text-muted-foreground">App URL</div><div className="font-mono truncate">{sys.server.appUrl}</div></div>}
            </div>
          ) : <div className="text-xs text-muted-foreground">Loading…</div>}
        </Panel>
      </div>
    </div>
  )
}
