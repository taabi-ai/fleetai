'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Loader2, Plug, Bot, CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { PageHeader, Panel, Field, readErr } from '../_components/ui-bits'

type S = { id: string; name: string; url: string; description?: string | null; hasAuth?: boolean; isActive: boolean; category?: string; createdAt: string }

const CATEGORIES: { value: string; label: string; hint: string; color: string }[] = [
  { value: 'general', label: 'General', hint: 'Any MCP server', color: 'border-white/10 text-muted-foreground' },
  { value: 'crm', label: 'CRM', hint: 'Taabi CRM (leads, accounts, KAM / sales ownership, onboarding)', color: 'border-orange-400/40 text-orange-400' },
  { value: 'dtwin', label: 'DTWIN', hint: 'Digital-twin services (vehicle / asset twins, simulations)', color: 'border-sky-400/40 text-sky-400' },
  { value: 'analytics', label: 'Analytics', hint: 'Data warehouse / BI tools', color: 'border-violet-400/40 text-violet-400' },
  { value: 'devops', label: 'DevOps', hint: 'CI/CD, Plane.so, Jira, incident tooling (feeds DORA)', color: 'border-emerald-400/40 text-emerald-400' },
  { value: 'other', label: 'Other', hint: '', color: 'border-white/10 text-muted-foreground' },
]
type Tool = { name: string; description?: string; inputSchema?: any }
type ConnResult = { ok: boolean; serverInfo?: any; tools?: Tool[]; error?: string }

const empty = { name: '', url: '', description: '', authToken: '', isActive: true, category: 'general' }

export default function McpServersPage() {
  const [servers, setServers] = useState<S[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<S | null>(null)
  const [form, setForm] = useState({ ...empty })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, ConnResult>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/mcp-servers')
    if (res.ok) setServers(await res.json())
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditing(null); setForm({ ...empty }); setOpen(true) }
  const openEdit = (s: S) => { setEditing(s); setForm({ name: s.name, url: s.url, description: s.description ?? '', authToken: '', isActive: s.isActive, category: s.category ?? 'general' }); setOpen(true) }

  const submit = async () => {
    setSaving(true)
    try {
      const body: any = { name: form.name, url: form.url, description: form.description, isActive: form.isActive, category: form.category }
      if (form.authToken) body.authToken = form.authToken
      const res = await fetch(editing ? `/api/admin/mcp-servers/${editing.id}` : '/api/admin/mcp-servers', {
        method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!res.ok) { toast.error(await readErr(res, 'Failed to save')); return }
      toast.success(editing ? 'Server updated' : 'Server added')
      setOpen(false); load()
    } finally { setSaving(false) }
  }

  const connect = async (s: S) => {
    setTesting(s.id)
    try {
      const res = await fetch(`/api/admin/mcp-servers/${s.id}`, { method: 'POST' })
      const d = await res.json().catch(() => ({ ok: false, error: 'Invalid response' }))
      setResults(prev => ({ ...prev, [s.id]: d }))
      if (d.ok) toast.success(`Connected — ${d.tools?.length ?? 0} tools/agents available`)
      else toast.error(d.error ?? 'Connection failed')
    } finally { setTesting(null) }
  }

  const toggle = async (s: S) => {
    const res = await fetch(`/api/admin/mcp-servers/${s.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !s.isActive }) })
    if (res.ok) setServers(prev => prev.map(x => x.id === s.id ? { ...x, isActive: !s.isActive } : x))
  }

  const remove = async (s: S) => {
    if (!confirm(`Remove MCP server "${s.name}"?`)) return
    const res = await fetch(`/api/admin/mcp-servers/${s.id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Removed'); setServers(prev => prev.filter(x => x.id !== s.id)) } else toast.error(await readErr(res, 'Failed'))
  }

  return (
    <div>
      <PageHeader
        title="MCP servers & agents"
        description="Register Model Context Protocol servers (Streamable HTTP endpoints). Tag each server with a category — e.g. CRM for the Taabi CRM MCP, DTWIN for digital-twin services — so the Sales & CRM and Engineering workspaces can discover them. Active servers become selectable in widget settings as links, and you can connect here to list the agents/tools each server exposes."
        actions={<Button size="sm" onClick={openCreate} className="gap-1"><Plus className="w-3.5 h-3.5" /> Add server</Button>}
      />
      {loading ? (
        <Panel className="p-8 text-center text-xs text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline" /></Panel>
      ) : servers.length === 0 ? (
        <Panel className="p-8 text-center text-xs text-muted-foreground">No MCP servers yet. Add one to make it available in widget settings.</Panel>
      ) : (
        <div className="space-y-3">
          {servers.map(s => {
            const r = results[s.id]
            return (
              <Panel key={s.id} className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{s.name}</span>
                      {s.category && s.category !== 'general' && <Badge variant="outline" className={`text-[10px] uppercase ${CATEGORIES.find(c => c.value === s.category)?.color ?? ''}`}>{s.category}</Badge>}
                      {!s.isActive && <Badge variant="outline" className="text-[10px] border-white/10 text-muted-foreground">inactive</Badge>}
                      {s.hasAuth && <Badge variant="outline" className="text-[10px] border-teal-400/40 text-teal-300">auth token set</Badge>}
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground truncate mt-0.5">{s.url}</div>
                    {s.description && <p className="text-xs text-muted-foreground mt-1">{s.description}</p>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Switch checked={s.isActive} onCheckedChange={() => toggle(s)} />
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1 border-white/10" onClick={() => connect(s)} disabled={testing === s.id}>
                      {testing === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plug className="w-3 h-3" />} Connect &amp; list agents
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(s)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => remove(s)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
                {r && (
                  <div className="mt-3 rounded-lg border border-white/5 bg-background/40 p-3">
                    {r.ok ? (
                      <>
                        <div className="flex items-center gap-2 text-xs text-emerald-300 mb-2"><CheckCircle2 className="w-3.5 h-3.5" /> Connected{r.serverInfo?.name ? ` to ${r.serverInfo.name}${r.serverInfo.version ? ` v${r.serverInfo.version}` : ''}` : ''} — {r.tools?.length ?? 0} tools</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {(r.tools ?? []).map(t => (
                            <div key={t.name} className="flex gap-2 p-2 rounded-md bg-white/[0.03]">
                              <Bot className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
                              <div className="min-w-0">
                                <div className="font-mono text-[11px] text-foreground truncate">{t.name}</div>
                                {t.description && <div className="text-[11px] text-muted-foreground line-clamp-2">{t.description}</div>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-destructive"><XCircle className="w-3.5 h-3.5" /> {r.error ?? 'Connection failed'}</div>
                    )}
                  </div>
                )}
              </Panel>
            )
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit MCP server' : 'Add MCP server'}</DialogTitle>
            <DialogDescription>Provide the HTTP endpoint of the MCP server. Tokens are stored server-side and never sent to browsers.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Name" htmlFor="m-name"><Input id="m-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Fleet telemetry agent" /></Field>
            <Field label="Endpoint URL" htmlFor="m-url" hint="e.g. https://mcp.example.com/mcp"><Input id="m-url" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} className="font-mono text-xs" /></Field>
            <Field label="Category" hint={CATEGORIES.find(c => c.value === form.category)?.hint}>
              <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Description" htmlFor="m-desc"><Textarea id="m-desc" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
            <Field label={editing?.hasAuth ? 'Bearer token (leave blank to keep existing)' : 'Bearer token (optional)'} htmlFor="m-token"><Input id="m-token" type="password" value={form.authToken} onChange={e => setForm({ ...form, authToken: e.target.value })} autoComplete="off" /></Field>
            <div className="flex items-center justify-between"><span className="text-xs">Active (selectable in widgets)</span><Switch checked={form.isActive} onCheckedChange={v => setForm({ ...form, isActive: v })} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving || !form.name || !form.url}>{saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}{editing ? 'Save' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
