'use client'

import { useEffect, useState } from 'react'
import { Rocket, ExternalLink, CheckCircle2, AlertTriangle, Loader2, Server, Cpu, Mail, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageHeader, Panel } from '../_components/ui-bits'

type Sys = {
  counts: { users: number; dashboards: number; widgets: number; mcpServers: number; llmProviders: number; notifications: number }
  smtpConfigured: boolean
  smtpHost?: string | null
  activeProvider: { name: string; model: string; kind: string }
  server: { node: string; platform: string; uptimeSec: number; memoryMb: number; env?: string; appUrl?: string | null; builtWithAbacusKey?: boolean }
}

const CONSOLE_URL = 'https://apps.abacus.ai/chatllm/manage_apps'

function fmtUptime(s: number) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function DeployPage() {
  const [sys, setSys] = useState<Sys | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  const load = async () => {
    setLoading(true)
    try { const r = await fetch('/api/admin/system'); if (r.ok) setSys(await r.json()) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const checks = sys ? [
    { ok: !!sys.activeProvider, label: 'AI provider configured', detail: sys.activeProvider ? `${sys.activeProvider.name} · ${sys.activeProvider.model}` : 'No active LLM provider — add one under LLM providers' },
    { ok: sys.smtpConfigured, label: 'Email delivery (SMTP)', detail: sys.smtpConfigured ? `Sending via ${sys.smtpHost}` : 'Not configured — share notifications will be in-app only' },
    { ok: sys.counts.users > 0, label: 'Users provisioned', detail: `${sys.counts.users} account(s)` },
    { ok: sys.counts.mcpServers > 0, label: 'MCP servers registered', detail: sys.counts.mcpServers > 0 ? `${sys.counts.mcpServers} server(s) available for widget links` : 'Optional — none registered yet' },
  ] : []

  return (
    <div>
      <PageHeader
        title="Deployment"
        description="Review the running build and roll out new features to the live environment."
        actions={
          <>
            <Button size="sm" variant="outline" onClick={load} disabled={loading}><RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh</Button>
            <Button size="sm" onClick={() => setOpen(true)}><Rocket className="w-4 h-4 mr-1" /> Deploy latest build</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel className="p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Server className="w-4 h-4 text-primary" /> Running instance</h2>
          {loading && !sys ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : sys ? (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div><dt className="text-[11px] text-muted-foreground">App URL</dt><dd className="font-mono text-xs break-all">{sys.server.appUrl ?? '—'}</dd></div>
              <div><dt className="text-[11px] text-muted-foreground">Environment</dt><dd><Badge variant="outline" className="text-[10px] uppercase">{sys.server.env ?? 'unknown'}</Badge></dd></div>
              <div><dt className="text-[11px] text-muted-foreground">Runtime</dt><dd className="font-mono text-xs">Node {sys.server.node} · {sys.server.platform}</dd></div>
              <div><dt className="text-[11px] text-muted-foreground">Uptime / memory</dt><dd className="font-mono text-xs">{fmtUptime(sys.server.uptimeSec)} · {sys.server.memoryMb} MB</dd></div>
              <div><dt className="text-[11px] text-muted-foreground flex items-center gap-1"><Cpu className="w-3 h-3" /> Active AI provider</dt><dd className="text-xs">{sys.activeProvider ? `${sys.activeProvider.name} (${sys.activeProvider.model})` : 'None'}</dd></div>
              <div><dt className="text-[11px] text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" /> SMTP</dt><dd className="text-xs">{sys.smtpConfigured ? sys.smtpHost : 'Not configured'}</dd></div>
            </dl>
          ) : <p className="text-xs text-destructive">Could not load system status.</p>}
        </Panel>

        <Panel className="p-5">
          <h2 className="text-sm font-semibold mb-3">Pre-flight checklist</h2>
          <ul className="space-y-3">
            {checks.map(c => (
              <li key={c.label} className="flex gap-2">
                {c.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />}
                <div><div className="text-sm">{c.label}</div><div className="text-[11px] text-muted-foreground">{c.detail}</div></div>
              </li>
            ))}
            {!sys && !loading && <li className="text-xs text-muted-foreground">Status unavailable.</li>}
          </ul>
        </Panel>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Rocket className="w-4 h-4 text-primary" /> Deploy latest build</DialogTitle>
            <DialogDescription>
              Builds and rollouts run on the hosting platform, outside this app, so they cannot be started from this page directly. Use one of the options below — each one publishes the most recent saved checkpoint to the live URL within a few minutes.
            </DialogDescription>
          </DialogHeader>
          <ol className="space-y-3 text-sm list-decimal pl-5">
            <li>
              Open the <a href={CONSOLE_URL} target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">app management console <ExternalLink className="w-3 h-3" /></a>, select this app and click <strong>Deploy</strong>.
            </li>
            <li>Or, in the build conversation, ask the assistant to <em>&ldquo;deploy the latest checkpoint&rdquo;</em>.</li>
            <li>After the rollout finishes, hit <strong>Refresh</strong> on this page and confirm the uptime counter has reset.</li>
          </ol>
          <p className="text-[11px] text-muted-foreground">Configuration made in this console (users, providers, SMTP, menus, MCP servers) is stored in the database and takes effect immediately — no deployment needed.</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
            <Button asChild><a href={CONSOLE_URL} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4 mr-1" /> Open management console</a></Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
