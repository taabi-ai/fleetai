'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Loader2, ExternalLink, ArrowUp, ArrowDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { ICONS } from '@/components/app-nav'
import { PageHeader, Panel, Field, readErr } from '../_components/ui-bits'

type Item = { id: string; label: string; path: string; icon?: string | null; order: number; roles: string[]; isActive: boolean; isExternal: boolean }

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'user', label: 'User' },
  { value: 'manager', label: 'Manager' },
  { value: 'super_admin', label: 'Super admin' },
]

const NO_ICON = '__none__'
const empty = { label: '', path: '', icon: NO_ICON, order: '', roles: [] as string[], isActive: true }

export default function MenuAdminPage() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)
  const [form, setForm] = useState({ ...empty })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/menu')
    if (res.ok) setItems(await res.json())
    else toast.error(await readErr(res, 'Failed to load menu'))
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditing(null); setForm({ ...empty, order: String((items.at(-1)?.order ?? 0) + 1) }); setOpen(true) }
  const openEdit = (it: Item) => {
    setEditing(it)
    setForm({ label: it.label, path: it.path, icon: it.icon && ICONS[it.icon] ? it.icon : NO_ICON, order: String(it.order), roles: [...it.roles], isActive: it.isActive })
    setOpen(true)
  }

  const submit = async () => {
    setSaving(true)
    try {
      const isExternal = /^https?:\/\//i.test(form.path.trim())
      const body = {
        label: form.label.trim(), path: form.path.trim(), isExternal,
        icon: form.icon === NO_ICON ? null : form.icon,
        order: form.order === '' ? undefined : Number(form.order),
        roles: form.roles, isActive: form.isActive,
      }
      const res = await fetch(editing ? `/api/admin/menu/${editing.id}` : '/api/admin/menu', {
        method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!res.ok) { toast.error(await readErr(res, 'Failed to save')); return }
      toast.success(editing ? 'Menu item updated' : 'Menu item added')
      setOpen(false); load()
    } finally { setSaving(false) }
  }

  const patch = async (it: Item, data: Partial<Item>) => {
    const res = await fetch(`/api/admin/menu/${it.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    if (!res.ok) { toast.error(await readErr(res, 'Update failed')); return }
    load()
  }

  const move = async (idx: number, dir: -1 | 1) => {
    const a = items[idx], b = items[idx + dir]
    if (!a || !b) return
    // swap positions; if orders collide, spread them apart
    const orderA = a.order === b.order ? b.order + dir : b.order
    const orderB = a.order === b.order ? a.order - dir : a.order
    await Promise.all([
      fetch(`/api/admin/menu/${a.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: orderA }) }),
      fetch(`/api/admin/menu/${b.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: orderB }) }),
    ])
    load()
  }

  const remove = async (it: Item) => {
    if (!confirm(`Delete menu item "${it.label}"?`)) return
    const res = await fetch(`/api/admin/menu/${it.id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error(await readErr(res, 'Delete failed')); return }
    toast.success('Menu item deleted'); load()
  }

  const toggleRole = (r: string) => setForm(f => ({ ...f, roles: f.roles.includes(r) ? f.roles.filter(x => x !== r) : [...f.roles, r] }))

  const SelectedIcon = form.icon !== NO_ICON ? ICONS[form.icon] : null

  return (
    <div>
      <PageHeader
        title="Menu & access"
        description="Define the navigation menu shown in the top bar and restrict each entry to specific roles. Items with no roles selected are visible to everyone. Paths may be internal routes (e.g. /library) or full URLs (opened in a new tab)."
        actions={<Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1" /> New menu item</Button>}
      />

      <Panel>
        {loading ? (
          <div className="p-8 flex justify-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No menu items yet.</div>
        ) : (
          <ul className="divide-y divide-white/5">
            {items.map((it, idx) => {
              const Icon = it.icon ? ICONS[it.icon] : null
              return (
                <li key={it.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex flex-col">
                    <button className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={idx === 0} onClick={() => move(idx, -1)} aria-label="Move up"><ArrowUp className="w-3.5 h-3.5" /></button>
                    <button className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={idx === items.length - 1} onClick={() => move(idx, 1)} aria-label="Move down"><ArrowDown className="w-3.5 h-3.5" /></button>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
                    {Icon ? <Icon className="w-4 h-4" /> : <span className="text-xs font-mono">{it.order}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">{it.label}</span>
                      {it.isExternal && <ExternalLink className="w-3 h-3 text-muted-foreground" />}
                      {!it.isActive && <Badge variant="outline" className="text-[10px]">Hidden</Badge>}
                    </div>
                    <div className="text-[11px] font-mono text-muted-foreground truncate">{it.path}</div>
                  </div>
                  <div className="hidden md:flex items-center gap-1 flex-wrap justify-end max-w-[220px]">
                    {it.roles.length === 0
                      ? <Badge variant="secondary" className="text-[10px]">Everyone</Badge>
                      : it.roles.map(r => <Badge key={r} variant="outline" className="text-[10px]">{ROLE_OPTIONS.find(o => o.value === r)?.label ?? r}</Badge>)}
                  </div>
                  <Switch checked={it.isActive} onCheckedChange={v => patch(it, { isActive: v })} aria-label="Active" />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(it)} aria-label="Edit"><Pencil className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(it)} aria-label="Delete"><Trash2 className="w-4 h-4" /></Button>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit menu item' : 'New menu item'}</DialogTitle>
            <DialogDescription>Menu changes are picked up by all users within a few seconds.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Label" htmlFor="m-label">
              <Input id="m-label" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="Reports" />
            </Field>
            <Field label="Path or URL" htmlFor="m-path" hint="Internal route (starts with /) or a full https:// URL for an external link.">
              <Input id="m-path" value={form.path} onChange={e => setForm({ ...form, path: e.target.value })} placeholder="/reports or https://…" className="font-mono" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Icon">
                <Select value={form.icon} onValueChange={v => setForm({ ...form, icon: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Icon">
                      <span className="flex items-center gap-2">{SelectedIcon && <SelectedIcon className="w-4 h-4" />}{form.icon === NO_ICON ? 'None' : form.icon}</span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value={NO_ICON}>None</SelectItem>
                    {Object.keys(ICONS).map(k => { const I = ICONS[k]; return (
                      <SelectItem key={k} value={k}><span className="flex items-center gap-2"><I className="w-4 h-4" />{k}</span></SelectItem>
                    ) })}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Order" htmlFor="m-order">
                <Input id="m-order" type="number" value={form.order} onChange={e => setForm({ ...form, order: e.target.value })} />
              </Field>
            </div>
            <Field label="Visible to roles" hint="Leave all unchecked to show the item to every signed-in user.">
              <div className="flex flex-wrap gap-4 pt-1">
                {ROLE_OPTIONS.map(o => (
                  <label key={o.value} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={form.roles.includes(o.value)} onCheckedChange={() => toggleRole(o.value)} />
                    {o.label}
                  </label>
                ))}
              </div>
            </Field>
            <div className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2">
              <span className="text-sm">Active (shown in menu)</span>
              <Switch checked={form.isActive} onCheckedChange={v => setForm({ ...form, isActive: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving || !form.label.trim() || !form.path.trim()}>
              {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}{editing ? 'Save changes' : 'Add item'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
