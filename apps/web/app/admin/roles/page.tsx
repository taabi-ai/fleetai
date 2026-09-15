'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Loader2, Save, ShieldCheck, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { PageHeader, Panel, Field, readErr } from '../_components/ui-bits'

type Perm = { key: string; group: string; label: string }
type R = { name: string; label: string; description?: string | null; permissions: string[]; isSystem: boolean; userCount: number }

export default function RolesPage() {
  const [perms, setPerms] = useState<Perm[]>([])
  const [roles, setRoles] = useState<R[]>([])
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', label: '', description: '' })
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/roles')
    if (res.ok) { const d = await res.json(); setPerms(d.permissions); setRoles(d.roles); setDirty({}) }
    else toast.error(await readErr(res, 'Failed to load roles'))
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  const groups = useMemo(() => {
    const g = new Map<string, Perm[]>()
    perms.forEach(p => { if (!g.has(p.group)) g.set(p.group, []); g.get(p.group)!.push(p) })
    return [...g.entries()]
  }, [perms])

  const current = (r: R) => dirty[r.name] ?? r.permissions
  const toggle = (r: R, key: string) => {
    if (r.name === 'super_admin') return
    const cur = current(r)
    setDirty({ ...dirty, [r.name]: cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key] })
  }

  const save = async (r: R) => {
    setSaving(r.name)
    const res = await fetch(`/api/admin/roles/${r.name}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ permissions: dirty[r.name] }) })
    if (res.ok) { toast.success(`Saved “${r.label}”. Users get the new permissions within 2 minutes.`); await load() }
    else toast.error(await readErr(res, 'Save failed'))
    setSaving(null)
  }

  const remove = async (r: R) => {
    if (!confirm(`Delete role “${r.label}”?`)) return
    const res = await fetch(`/api/admin/roles/${r.name}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Role deleted'); await load() } else toast.error(await readErr(res, 'Delete failed'))
  }

  const create = async () => {
    setCreating(true)
    const res = await fetch('/api/admin/roles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, permissions: ['dashboards.view'] }) })
    if (res.ok) { toast.success('Role created — now tick its permissions below'); setOpen(false); setForm({ name: '', label: '', description: '' }); await load() }
    else toast.error(await readErr(res, 'Create failed'))
    setCreating(false)
  }

  return (
    <div>
      <PageHeader
        title="Roles & permissions"
        description="Role-based access control. Every user has exactly one role; each role holds a set of permissions that gate the AI assistant, the Sales & CRM workspace, Engineering / DORA metrics and the admin console. Super admins always hold every permission."
        actions={<Button size="sm" onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" /> New role</Button>}
      />

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-6"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left p-3 font-medium text-muted-foreground min-w-[220px]">Permission</th>
                {roles.map(r => (
                  <th key={r.name} className="p-3 text-center min-w-[120px] align-top">
                    <div className="flex flex-col items-center gap-1">
                      <span className="font-semibold text-foreground inline-flex items-center gap-1">{r.isSystem && <Lock className="w-3 h-3 text-muted-foreground" />}{r.label}</span>
                      <code className="text-[10px] text-muted-foreground">{r.name}</code>
                      <Badge variant="outline" className="text-[10px] border-white/10">{r.userCount} user{r.userCount === 1 ? '' : 's'}</Badge>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(([group, list]) => (
                <GroupRows key={group} group={group} list={list} roles={roles} current={current} toggle={toggle} />
              ))}
              <tr className="border-t border-white/10">
                <td className="p-3 text-muted-foreground">Actions</td>
                {roles.map(r => (
                  <td key={r.name} className="p-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {r.name !== 'super_admin' && (
                        <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={!dirty[r.name] || saving === r.name} onClick={() => save(r)}>
                          {saving === r.name ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />} Save
                        </Button>
                      )}
                      {!r.isSystem && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400" onClick={() => remove(r)} title="Delete role"><Trash2 className="w-3.5 h-3.5" /></Button>
                      )}
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </Panel>
      )}

      <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs text-muted-foreground flex gap-3">
        <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-foreground font-medium mb-1">How enforcement works</p>
          <p>API routes and pages call <code>requirePermission(&apos;…&apos;)</code> from <code>lib/rbac.ts</code>. The AI assistant requires <code>ai.use</code>, the Sales &amp; CRM workspace requires <code>crm.view</code>, Engineering / DORA requires <code>dora.view</code>, and the admin console is restricted to super admins. Roles are cached for 30 seconds on the server and refreshed into each user&apos;s session within two minutes.</p>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New role</DialogTitle>
            <DialogDescription>Create a custom role, then tick its permissions in the matrix.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Role key" hint="Lowercase identifier, e.g. marketing or kam_lead"><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="marketing" /></Field>
            <Field label="Label"><Input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="Marketing team" /></Field>
            <Field label="Description"><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Optional" /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={creating || !form.name || !form.label}>{creating && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function GroupRows({ group, list, roles, current, toggle }: { group: string; list: Perm[]; roles: R[]; current: (r: R) => string[]; toggle: (r: R, k: string) => void }) {
  return (
    <>
      <tr className="bg-white/[0.03]"><td colSpan={roles.length + 1} className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{group}</td></tr>
      {list.map(p => (
        <tr key={p.key} className="border-t border-white/5">
          <td className="p-3"><div className="text-foreground">{p.label}</div><code className="text-[10px] text-muted-foreground">{p.key}</code></td>
          {roles.map(r => {
            const checked = r.name === 'super_admin' || current(r).includes(p.key)
            return (
              <td key={r.name} className="p-3 text-center">
                <Checkbox checked={checked} disabled={r.name === 'super_admin'} onCheckedChange={() => toggle(r, p.key)} aria-label={`${r.label}: ${p.label}`} />
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}
