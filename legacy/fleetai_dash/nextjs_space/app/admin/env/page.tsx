'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, Pencil, Trash2, Search, KeyRound, Lock, RefreshCw, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { PageHeader, Panel, Field, readErr } from '../_components/ui-bits'

type Item = {
  key: string; group: string; description: string | null; isSecret: boolean; bootOnly: boolean
  hasOverride: boolean; hasProcessValue: boolean; value: string; isSet: boolean; updatedAt: string | null
}

const GROUP_ORDER = ['Core', 'AI', 'Storage', 'Platform storage', 'Custom', 'Process']

export default function EnvPage() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [showProcess, setShowProcess] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)
  const [form, setForm] = useState({ key: '', value: '', isSecret: false, description: '' })
  const [saving, setSaving] = useState(false)
  const [del, setDel] = useState<Item | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/env')
    if (res.ok) setItems((await res.json()).items)
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const groups = useMemo(() => {
    const s = q.trim().toLowerCase()
    const list = items.filter(i => (showProcess || i.group !== 'Process') && (!s || i.key.toLowerCase().includes(s) || (i.description ?? '').toLowerCase().includes(s)))
    const g = new Map<string, Item[]>()
    list.forEach(i => { g.set(i.group, [...(g.get(i.group) ?? []), i]) })
    return Array.from(g.entries()).sort((a, b) => GROUP_ORDER.indexOf(a[0]) - GROUP_ORDER.indexOf(b[0]))
  }, [items, q, showProcess])

  const openCreate = () => { setEditing(null); setForm({ key: '', value: '', isSecret: false, description: '' }); setOpen(true) }
  const openEdit = (i: Item) => { setEditing(i); setForm({ key: i.key, value: i.isSecret ? '' : (i.hasOverride ? i.value : ''), isSecret: i.isSecret, description: i.description ?? '' }); setOpen(true) }

  const submit = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/env', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (!res.ok) { toast.error(await readErr(res, 'Failed to save')); return }
      toast.success(editing ? 'Variable updated' : 'Variable created')
      setOpen(false); load()
    } finally { setSaving(false) }
  }

  const remove = async () => {
    if (!del) return
    const res = await fetch(`/api/admin/env?key=${encodeURIComponent(del.key)}`, { method: 'DELETE' })
    if (!res.ok) { toast.error(await readErr(res, 'Failed to remove')); return }
    toast.success(`Override for ${del.key} removed`); setDel(null); load()
  }

  const overrides = items.filter(i => i.hasOverride).length

  return (
    <div>
      <PageHeader
        title="Environment variables"
        description="Manage runtime configuration from the console. Values saved here override the deployed environment immediately (within ~15s) for everything the app reads through its config layer — storage, AI gateway, integrations. Secret values are masked and never returned to the browser."
        actions={
          <>
            <Button size="sm" variant="outline" onClick={load}><RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh</Button>
            <Button size="sm" onClick={openCreate}><Plus className="w-3.5 h-3.5 mr-1.5" /> Add variable</Button>
          </>
        }
      />

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs px-3 py-2 mb-4 flex gap-2">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>Boot-time variables (database URL, session secrets, public URL) are read when the server starts — overriding them here has no effect until the app is redeployed. They are shown for visibility only.</span>
      </div>

      <Panel className="p-3 mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input className="pl-8 h-8 text-xs" placeholder="Search variables…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={showProcess} onCheckedChange={setShowProcess} /> Show all process variables</label>
        <span className="text-xs text-muted-foreground ml-auto">{overrides} console override{overrides === 1 ? '' : 's'}</span>
      </Panel>

      {loading && items.length === 0 && <div className="py-10 text-center"><Loader2 className="w-4 h-4 animate-spin inline" /></div>}

      {groups.map(([group, list]) => (
        <Panel key={group} className="mb-4">
          <div className="px-4 py-2 border-b border-border text-[10px] uppercase tracking-widest text-muted-foreground">{group}</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[260px]">Key</TableHead>
                <TableHead>Value</TableHead>
                <TableHead className="w-[140px]">Source</TableHead>
                <TableHead className="w-[90px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map(i => (
                <TableRow key={i.key}>
                  <TableCell>
                    <div className="font-mono text-xs flex items-center gap-1.5">{i.isSecret && <Lock className="w-3 h-3 text-muted-foreground" />}{i.key}</div>
                    {i.description && <div className="text-[11px] text-muted-foreground mt-0.5 max-w-md">{i.description}</div>}
                  </TableCell>
                  <TableCell className="font-mono text-xs break-all max-w-[360px]">
                    {i.isSet ? i.value : <span className="text-muted-foreground italic">not set</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {i.hasOverride && <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">console</Badge>}
                      {i.hasProcessValue && <Badge variant="outline" className="text-[10px]">env</Badge>}
                      {i.bootOnly && <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600 dark:text-amber-300">boot-time</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" className="h-7 px-2" title="Edit" onClick={() => openEdit(i)} disabled={i.bootOnly}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" title="Remove override" onClick={() => setDel(i)} disabled={!i.hasOverride}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      ))}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><KeyRound className="w-4 h-4 text-primary" /> {editing ? `Edit ${editing.key}` : 'Add variable'}</DialogTitle>
            <DialogDescription>{editing?.isSecret ? 'Leave the value blank to keep the stored secret.' : 'The value takes effect within about 15 seconds without a redeploy.'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Key" hint="UPPER_SNAKE_CASE">
              <Input value={form.key} disabled={!!editing} onChange={e => setForm(f => ({ ...f, key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') }))} className="h-8 text-xs font-mono" placeholder="MY_SETTING" />
            </Field>
            <Field label="Value">
              <Textarea value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} className="text-xs font-mono min-h-[72px]" placeholder={editing?.isSecret ? '•••••• (unchanged)' : ''} />
            </Field>
            <div className="flex items-center justify-between">
              <div><div className="text-xs">Secret</div><div className="text-[11px] text-muted-foreground">Masked in the console and redacted from audit logs.</div></div>
              <Switch checked={form.isSecret} onCheckedChange={v => setForm(f => ({ ...f, isSecret: v }))} />
            </div>
            <Field label="Description (optional)"><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="h-8 text-xs" /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={submit} disabled={saving || !form.key}>{saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />} Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!del} onOpenChange={o => !o && setDel(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove override?</DialogTitle>
            <DialogDescription>{del?.key} will fall back to the deployed environment value{del?.hasProcessValue ? '' : ' (currently not set)'}.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDel(null)}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={remove}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
