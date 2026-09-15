'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Plus, Pencil, Trash2, Loader2, KeyRound, ShieldOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { PageHeader, Panel, Field, readErr } from '../_components/ui-bits'

const FALLBACK_ROLES = [{ name: 'user', label: 'User' }, { name: 'manager', label: 'Manager' }, { name: 'super_admin', label: 'Super admin' }]

type U = {
  id: string; name?: string | null; email: string; role: string; isActive: boolean; createdAt: string
  _count?: { dashboards: number; libraryWidgets: number }
}

const empty = { name: '', email: '', password: '', role: 'user', isActive: true }

export default function UsersPage() {
  const { data: session } = useSession() || {}
  const meId = session?.user?.id
  const [users, setUsers] = useState<U[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<U | null>(null)
  const [form, setForm] = useState({ ...empty })
  const [saving, setSaving] = useState(false)
  const [q, setQ] = useState('')
  const [roles, setRoles] = useState<{ name: string; label: string }[]>(FALLBACK_ROLES)

  const load = useCallback(async () => {
    setLoading(true)
    const [res, rr] = await Promise.all([fetch('/api/admin/users'), fetch('/api/admin/roles')])
    if (res.ok) setUsers(await res.json())
    if (rr.ok) { const d = await rr.json(); if (Array.isArray(d?.roles) && d.roles.length) setRoles(d.roles.map((r: any) => ({ name: r.name, label: r.label }))) }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditing(null); setForm({ ...empty }); setOpen(true) }
  const openEdit = (u: U) => { setEditing(u); setForm({ name: u.name ?? '', email: u.email, password: '', role: u.role, isActive: u.isActive }); setOpen(true) }

  const submit = async () => {
    setSaving(true)
    try {
      const url = editing ? `/api/admin/users/${editing.id}` : '/api/admin/users'
      const body: any = { name: form.name, email: form.email, role: form.role, isActive: form.isActive }
      if (form.password) body.password = form.password
      const res = await fetch(url, { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) { toast.error(await readErr(res, 'Failed to save user')); return }
      toast.success(editing ? 'User updated' : 'User created')
      setOpen(false)
      load()
    } finally { setSaving(false) }
  }

  const toggleActive = async (u: U) => {
    const res = await fetch(`/api/admin/users/${u.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !u.isActive }) })
    if (!res.ok) { toast.error(await readErr(res, 'Failed')); return }
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, isActive: !u.isActive } : x))
  }

  const clearPin = async (u: U) => {
    const res = await fetch(`/api/admin/users/${u.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clearPin: true }) })
    if (res.ok) toast.success('AI PIN cleared'); else toast.error(await readErr(res, 'Failed'))
  }

  const remove = async (u: U) => {
    if (!confirm(`Delete ${u.email}? Their dashboards and widgets will be removed. This cannot be undone.`)) return
    const res = await fetch(`/api/admin/users/${u.id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error(await readErr(res, 'Failed to delete')); return }
    toast.success('User deleted')
    setUsers(prev => prev.filter(x => x.id !== u.id))
  }

  const shown = users.filter(u => { const s = q.toLowerCase(); return !s || u.email.toLowerCase().includes(s) || (u.name ?? '').toLowerCase().includes(s) || u.role.includes(s) })

  return (
    <div>
      <PageHeader
        title="User management"
        description="Create, edit, deactivate or delete accounts and assign roles. Deactivated users are signed out within two minutes and cannot log in."
        actions={<Button size="sm" onClick={openCreate} className="gap-1"><Plus className="w-3.5 h-3.5" /> New user</Button>}
      />
      <Panel>
        <div className="p-3 border-b border-white/5">
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search users…" className="h-8 text-xs max-w-xs" />
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-white/5">
              <TableHead className="text-xs">User</TableHead>
              <TableHead className="text-xs">Role</TableHead>
              <TableHead className="text-xs">Dashboards</TableHead>
              <TableHead className="text-xs">Active</TableHead>
              <TableHead className="text-xs text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-xs text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline" /></TableCell></TableRow>
            ) : shown.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-xs text-muted-foreground">No users found</TableCell></TableRow>
            ) : shown.map(u => (
              <TableRow key={u.id} className="border-white/5">
                <TableCell>
                  <div className="text-xs font-medium text-foreground">{u.name ?? '—'} {u.id === meId && <span className="text-[10px] text-primary">(you)</span>}</div>
                  <div className="text-[11px] text-muted-foreground">{u.email}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] ${u.role === 'super_admin' ? 'border-primary/40 text-primary' : u.role === 'manager' ? 'border-teal-400/40 text-teal-300' : 'border-white/10 text-muted-foreground'}`}>{u.role.replace('_', ' ')}</Badge>
                </TableCell>
                <TableCell className="text-xs font-mono">{u._count?.dashboards ?? 0}</TableCell>
                <TableCell><Switch checked={u.isActive} onCheckedChange={() => toggleActive(u)} disabled={u.id === meId} /></TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(u)} title="Edit"><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => clearPin(u)} title="Clear AI assistant PIN"><ShieldOff className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => remove(u)} disabled={u.id === meId} title="Delete"><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit user' : 'Create user'}</DialogTitle>
            <DialogDescription>{editing ? 'Update profile, role, status or reset the password.' : 'The user can sign in immediately with the email and password below.'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Name" htmlFor="u-name"><Input id="u-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Email" htmlFor="u-email"><Input id="u-email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label={editing ? 'New password (leave blank to keep)' : 'Password'} htmlFor="u-pass">
              <div className="relative">
                <KeyRound className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input id="u-pass" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="pl-8" autoComplete="new-password" />
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Role">
                <Select value={form.role} onValueChange={v => setForm({ ...form, role: v })} disabled={editing?.id === meId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{roles.map(r => <SelectItem key={r.name} value={r.name}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Active">
                <div className="h-9 flex items-center"><Switch checked={form.isActive} onCheckedChange={v => setForm({ ...form, isActive: v })} disabled={editing?.id === meId} /></div>
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving || !form.email || (!editing && form.password.length < 6)}>{saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}{editing ? 'Save' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
