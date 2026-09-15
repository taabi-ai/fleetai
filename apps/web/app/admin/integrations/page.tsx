'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Save, PlugZap, ExternalLink, Activity, GitBranch, Briefcase, CheckCircle2, XCircle, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { PageHeader, Panel, Field, readErr } from '../_components/ui-bits'

type FieldDef = { key: string; label: string; placeholder?: string; hint?: string; secret?: boolean; required?: boolean }
type Def = { key: string; name: string; group: string; description: string; docs: string; fields: FieldDef[]; testable: boolean }
type State = { key: string; enabled: boolean; config: Record<string, string | boolean>; updatedAt: string | null }
type Item = { def: Def; state: State }

const GROUP_ICON: Record<string, typeof Activity> = { Observability: Activity, Engineering: GitBranch, 'Sales & CRM': Briefcase }

export default function IntegrationsPage() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/integrations')
    if (res.ok) setItems((await res.json()).integrations)
    else toast.error(await readErr(res, 'Failed to load integrations'))
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  const groups = Array.from(new Set(items.map(i => i.def.group)))

  return (
    <div>
      <PageHeader
        title="Integrations"
        description="Connect external systems. Secrets are stored server-side and never sent back to the browser; leave a secret field blank to keep the stored value. New Relic RUM is injected on every page as soon as it is enabled."
      />
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-6"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : (
        <div className="space-y-8">
          {groups.map(g => {
            const Icon = GROUP_ICON[g] ?? PlugZap
            return (
              <section key={g} id={g.toLowerCase().replace(/[^a-z]+/g, '-')}>
                <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3 inline-flex items-center gap-2"><Icon className="w-3.5 h-3.5" /> {g}</h2>
                <div className="grid gap-4 lg:grid-cols-2">
                  {items.filter(i => i.def.group === g).map(i => <IntegrationCard key={i.def.key} item={i} onChange={load} />)}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

function IntegrationCard({ item, onChange }: { item: Item; onChange: () => Promise<void> }) {
  const { def, state } = item
  const initial = Object.fromEntries(def.fields.map(f => [f.key, f.secret ? '' : String(state.config[f.key] ?? '')]))
  const [form, setForm] = useState<Record<string, string>>(initial)
  const [enabled, setEnabled] = useState(state.enabled)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const save = async (nextEnabled = enabled) => {
    setSaving(true)
    const res = await fetch(`/api/admin/integrations/${def.key}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: nextEnabled, config: form }) })
    if (res.ok) { toast.success(`${def.name} saved`); setEnabled(nextEnabled); await onChange() }
    else { toast.error(await readErr(res, 'Save failed')); setEnabled(state.enabled) }
    setSaving(false)
  }

  const test = async () => {
    setTesting(true); setTestResult(null)
    const res = await fetch(`/api/admin/integrations/${def.key}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: form }) })
    const d = await res.json().catch(() => ({ ok: false, message: 'Test failed' }))
    setTestResult(d)
    setTesting(false)
  }

  const configured = def.fields.filter(f => f.required).every(f => (f.secret ? state.config[`has_${f.key}`] : state.config[f.key]))

  return (
    <Panel className="p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium text-foreground">{def.name}</h3>
            <Badge variant="outline" className={`text-[10px] ${enabled ? 'border-emerald-400/40 text-emerald-400' : configured ? 'border-amber-400/40 text-amber-400' : 'border-white/10 text-muted-foreground'}`}>
              {enabled ? 'Enabled' : configured ? 'Configured · off' : 'Not configured'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{def.description}</p>
          <a href={def.docs} target="_blank" rel="noreferrer" className="text-[11px] text-primary inline-flex items-center gap-1 mt-1 hover:underline">Docs <ExternalLink className="w-3 h-3" /></a>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-muted-foreground">{enabled ? 'On' : 'Off'}</span>
          <Switch checked={enabled} disabled={saving} onCheckedChange={v => { setEnabled(v); void save(v) }} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {def.fields.map(f => (
          <Field key={f.key} label={`${f.label}${f.required ? ' *' : ''}`} hint={f.secret && state.config[`has_${f.key}`] ? `Stored ✓ — leave blank to keep. ${f.hint ?? ''}` : f.hint}>
            <Input
              type={f.secret ? 'password' : 'text'}
              value={form[f.key] ?? ''}
              placeholder={f.secret && state.config[`has_${f.key}`] ? '•••••••• (stored)' : f.placeholder}
              onChange={e => setForm({ ...form, [f.key]: e.target.value })}
              autoComplete="off"
            />
          </Field>
        ))}
      </div>

      {def.key === 'dora_webhook' && <WebhookExample />}

      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" onClick={() => save()} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Save</Button>
        {def.testable && (
          <Button size="sm" variant="outline" onClick={test} disabled={testing}>{testing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <PlugZap className="w-4 h-4 mr-1" />} Test connection</Button>
        )}
        {testResult && (
          <span className={`text-xs inline-flex items-center gap-1 ${testResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
            {testResult.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />} {testResult.message}
          </span>
        )}
        {state.updatedAt && <span className="text-[11px] text-muted-foreground ml-auto">Updated {new Date(state.updatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>}
      </div>
    </Panel>
  )
}

function WebhookExample() {
  const snippet = `curl -X POST "$APP_URL/api/dora/events" \\
  -H "x-dora-token: $DORA_TOKEN" -H "Content-Type: application/json" \\
  -d '{"type":"deployment","service":"fleetai-dash","env":"production","status":"success","ref":"'$GITHUB_SHA'","leadTimeMin":95}'`
  return (
    <div className="rounded-lg bg-black/30 border border-white/10 p-3 text-[11px] font-mono text-muted-foreground relative">
      <button type="button" className="absolute top-2 right-2 text-muted-foreground hover:text-foreground" title="Copy" onClick={() => { navigator.clipboard.writeText(snippet); toast.success('Copied') }}><Copy className="w-3.5 h-3.5" /></button>
      <pre className="whitespace-pre-wrap pr-6">{snippet}</pre>
      <p className="mt-2 font-sans">Event types: <code>deployment</code> (status success|failed), <code>incident_opened</code>, <code>incident_resolved</code> (same <code>incidentId</code>). Metrics appear on the Engineering page.</p>
    </div>
  )
}
