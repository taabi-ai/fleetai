'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Loader2, Star, Zap, CheckCircle2, XCircle, ExternalLink, Cpu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { LLM_PRESETS } from '@/lib/llm-presets'
import { PageHeader, Panel, Field, readErr } from '../_components/ui-bits'

type P = { id: string; name: string; kind: string; baseUrl: string; model: string; isDefault: boolean; isActive: boolean; notes?: string | null; hasKey?: boolean; keyHint?: string | null }
type TestResult = { ok: boolean; reply?: string; latencyMs?: number; error?: string }

const empty = { preset: 'openai', name: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: '', notes: '', isActive: true, isDefault: false }

export default function LlmProvidersPage() {
  const [providers, setProviders] = useState<P[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<P | null>(null)
  const [form, setForm] = useState({ ...empty })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, TestResult>>({})
  const [formTest, setFormTest] = useState<TestResult | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/llm-providers')
    if (res.ok) setProviders(await res.json())
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const preset = useMemo(() => LLM_PRESETS.find(p => p.id === form.preset), [form.preset])

  const applyPreset = (id: string) => {
    const p = LLM_PRESETS.find(x => x.id === id)
    if (!p) return
    setForm(f => ({ ...f, preset: id, name: p.name.replace(/ \(.*\)$/, ''), kind: p.kind, baseUrl: p.baseUrl, model: p.defaultModel }))
    setFormTest(null)
  }

  const openCreate = () => { setEditing(null); setForm({ ...empty }); setFormTest(null); setOpen(true) }
  const openEdit = (p: P) => {
    const match = LLM_PRESETS.find(x => x.baseUrl === p.baseUrl)
    setEditing(p)
    setForm({ preset: match?.id ?? (p.kind === 'anthropic' ? 'custom-anthropic' : 'custom-openai'), name: p.name, kind: p.kind, baseUrl: p.baseUrl, model: p.model, apiKey: '', notes: p.notes ?? '', isActive: p.isActive, isDefault: p.isDefault })
    setFormTest(null); setOpen(true)
  }

  const payload = () => {
    const b: any = { name: form.name, kind: form.kind, baseUrl: form.baseUrl, model: form.model, notes: form.notes, isActive: form.isActive, isDefault: form.isDefault }
    if (form.apiKey) b.apiKey = form.apiKey
    return b
  }

  const submit = async () => {
    setSaving(true)
    try {
      const res = await fetch(editing ? `/api/admin/llm-providers/${editing.id}` : '/api/admin/llm-providers', {
        method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()),
      })
      if (!res.ok) { toast.error(await readErr(res, 'Failed to save')); return }
      toast.success(editing ? 'Provider updated' : 'Provider added')
      setOpen(false); load()
    } finally { setSaving(false) }
  }

  const testForm = async () => {
    setTesting('form'); setFormTest(null)
    try {
      // When editing without re-entering the key, test the saved record instead.
      const useSaved = editing && !form.apiKey && editing.hasKey && editing.baseUrl === form.baseUrl && editing.model === form.model
      const res = useSaved
        ? await fetch(`/api/admin/llm-providers/${editing!.id}`, { method: 'POST' })
        : await fetch('/api/admin/llm-providers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ test: true, ...payload() }) })
      const d = await res.json().catch(() => ({ ok: false, error: 'Invalid response' }))
      setFormTest(d)
    } finally { setTesting(null) }
  }

  const testSaved = async (p: P) => {
    setTesting(p.id)
    try {
      const res = await fetch(`/api/admin/llm-providers/${p.id}`, { method: 'POST' })
      const d = await res.json().catch(() => ({ ok: false, error: 'Invalid response' }))
      setResults(prev => ({ ...prev, [p.id]: d }))
      if (d.ok) toast.success(`OK in ${d.latencyMs} ms`); else toast.error(d.error ?? 'Test failed')
    } finally { setTesting(null) }
  }

  const setDefault = async (p: P) => {
    const res = await fetch(`/api/admin/llm-providers/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isDefault: true, isActive: true }) })
    if (res.ok) { toast.success(`${p.name} is now the default for the AI assistant`); load() } else toast.error(await readErr(res, 'Failed'))
  }

  const toggle = async (p: P) => {
    const res = await fetch(`/api/admin/llm-providers/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !p.isActive }) })
    if (res.ok) load(); else toast.error(await readErr(res, 'Failed'))
  }

  const remove = async (p: P) => {
    if (!confirm(`Delete provider "${p.name}"?`)) return
    const res = await fetch(`/api/admin/llm-providers/${p.id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Deleted'); load() } else toast.error(await readErr(res, 'Failed'))
  }

  const grouped = useMemo(() => ({
    openai: LLM_PRESETS.filter(p => p.kind === 'openai'),
    anthropic: LLM_PRESETS.filter(p => p.kind === 'anthropic'),
  }), [])

  return (
    <div>
      <PageHeader
        title="LLM providers"
        description="Configure which model powers the AI assistant that builds widgets. Pick from OpenAI-compatible or Anthropic-compatible providers (OpenAI, Claude, DeepSeek, OpenCode Zen, OpenRouter, Kilo Code, Cline, NVIDIA NIM, Groq, and many more) or add any custom endpoint. The active default provider is used for every generation; if none is set, the built-in Abacus.AI model is used."
        actions={<Button size="sm" onClick={openCreate} className="gap-1"><Plus className="w-3.5 h-3.5" /> Add provider</Button>}
      />
      {loading ? (
        <Panel className="p-8 text-center text-xs text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline" /></Panel>
      ) : providers.length === 0 ? (
        <Panel className="p-8 text-center text-xs text-muted-foreground">
          <Cpu className="w-6 h-6 mx-auto mb-2 opacity-40" />
          No custom providers configured. The assistant is using the built-in Abacus.AI model.
        </Panel>
      ) : (
        <div className="space-y-3">
          {providers.map(p => {
            const r = results[p.id]
            return (
              <Panel key={p.id} className={`p-4 ${p.isDefault ? 'border-primary/40' : ''}`}>
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{p.name}</span>
                      {p.isDefault && <Badge className="text-[10px] gap-1 bg-primary/20 text-primary border-primary/30"><Star className="w-2.5 h-2.5" /> default</Badge>}
                      {!p.isActive && <Badge variant="outline" className="text-[10px] border-white/10 text-muted-foreground">inactive</Badge>}
                      <Badge variant="outline" className="text-[10px] border-white/10 text-muted-foreground">{p.kind}</Badge>
                      {p.hasKey ? <Badge variant="outline" className="text-[10px] border-teal-400/40 text-teal-300 font-mono">key {p.keyHint}</Badge> : <Badge variant="outline" className="text-[10px] border-amber-400/40 text-amber-300">no key</Badge>}
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground truncate mt-0.5">{p.model} @ {p.baseUrl}</div>
                    {p.notes && <p className="text-xs text-muted-foreground mt-1">{p.notes}</p>}
                    {r && (
                      <div className={`mt-2 text-[11px] flex items-center gap-1 ${r.ok ? 'text-emerald-300' : 'text-destructive'}`}>
                        {r.ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {r.ok ? `Responded "${r.reply}" in ${r.latencyMs} ms` : r.error}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Switch checked={p.isActive} onCheckedChange={() => toggle(p)} disabled={p.isDefault} />
                    {!p.isDefault && <Button variant="outline" size="sm" className="h-7 text-xs gap-1 border-white/10" onClick={() => setDefault(p)}><Star className="w-3 h-3" /> Make default</Button>}
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1 border-white/10" onClick={() => testSaved(p)} disabled={testing === p.id}>{testing === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />} Test</Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(p)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => remove(p)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              </Panel>
            )
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit provider' : 'Add LLM provider'}</DialogTitle>
            <DialogDescription>Choose a preset to auto-fill the endpoint, then paste your API key. Keys are stored server-side only.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Preset">
              <Select value={form.preset} onValueChange={applyPreset}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {grouped.openai.map(p => <SelectItem key={p.id} value={p.id}>{p.name}{p.free ? ' · free tier' : ''}</SelectItem>)}
                  {grouped.anthropic.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {preset?.docs && (
                <a href={preset.docs} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                  Get an API key / model list <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {preset?.note && <p className="text-[11px] text-muted-foreground">{preset.note}</p>}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Display name" htmlFor="p-name"><Input id="p-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="API style">
                <Select value={form.kind} onValueChange={v => setForm({ ...form, kind: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI-compatible</SelectItem>
                    <SelectItem value="anthropic">Anthropic Messages</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Base URL" htmlFor="p-url"><Input id="p-url" value={form.baseUrl} onChange={e => setForm({ ...form, baseUrl: e.target.value })} className="font-mono text-xs" /></Field>
            <Field label="Model" htmlFor="p-model" hint="Exact model id as expected by the provider."><Input id="p-model" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} className="font-mono text-xs" /></Field>
            <Field label={editing?.hasKey ? `API key (leave blank to keep ${editing.keyHint})` : 'API key'} htmlFor="p-key" hint={form.preset === 'abacus' ? 'Optional — the platform key is used when blank.' : undefined}>
              <Input id="p-key" type="password" value={form.apiKey} onChange={e => setForm({ ...form, apiKey: e.target.value })} autoComplete="off" className="font-mono text-xs" />
            </Field>
            <Field label="Notes" htmlFor="p-notes"><Textarea id="p-notes" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
            <div className="flex items-center justify-between gap-4">
              <label className="flex items-center gap-2 text-xs"><Switch checked={form.isActive} onCheckedChange={v => setForm({ ...form, isActive: v })} /> Active</label>
              <label className="flex items-center gap-2 text-xs"><Switch checked={form.isDefault} onCheckedChange={v => setForm({ ...form, isDefault: v, isActive: v ? true : form.isActive })} /> Use as default for AI assistant</label>
            </div>
            {formTest && (
              <div className={`text-[11px] flex items-center gap-1 rounded-md p-2 ${formTest.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
                {formTest.ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {formTest.ok ? `Responded "${formTest.reply}" in ${formTest.latencyMs} ms` : formTest.error}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={testForm} disabled={testing === 'form' || !form.baseUrl || !form.model} className="gap-1 border-white/10">{testing === 'form' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />} Test connection</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving || !form.name || !form.baseUrl || !form.model}>{saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}{editing ? 'Save' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
