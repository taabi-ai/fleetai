'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, Share2, X, Search } from 'lucide-react'
import { toast } from 'sonner'

type U = { id: string; name?: string | null; email?: string | null }
type Share = { id: string; userId: string; createdAt: string; user: U }

export function ShareDialog({ open, onOpenChange, dashboardId, dashboardName }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  dashboardId: string
  dashboardName: string
}) {
  const [users, setUsers] = useState<U[]>([])
  const [shares, setShares] = useState<Share[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [extraEmails, setExtraEmails] = useState('')
  const [message, setMessage] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/dashboard/${dashboardId}/share`)
      if (res.ok) {
        const d = await res.json()
        setUsers(d.users ?? [])
        setShares(d.shares ?? [])
      }
    } finally { setLoading(false) }
  }

  useEffect(() => {
    if (open) { setSelected(new Set()); setExtraEmails(''); setMessage(''); setQuery(''); load() }
  }, [open, dashboardId])

  const sharedIds = useMemo(() => new Set(shares.map(s => s.userId)), [shares])
  const candidates = useMemo(() => users.filter(u => !sharedIds.has(u.id)).filter(u => {
    const q = query.trim().toLowerCase()
    return !q || (u.name ?? '').toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q)
  }), [users, sharedIds, query])

  const toggle = (id: string) => setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const submit = async () => {
    const emails = extraEmails.split(/[,\s]+/).map(e => e.trim()).filter(Boolean)
    if (selected.size === 0 && emails.length === 0) { toast.error('Select at least one person'); return }
    setSending(true)
    try {
      const res = await fetch(`/api/dashboard/${dashboardId}/share`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: Array.from(selected), emails, message: message.trim() || undefined }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d?.error ?? 'Failed to share'); return }
      toast.success(`Shared with ${d.added ?? 0} ${d.added === 1 ? 'person' : 'people'} — they have been notified`)
      setShares(d.shares ?? [])
      setSelected(new Set()); setExtraEmails(''); setMessage('')
    } finally { setSending(false) }
  }

  const revoke = async (userId: string) => {
    const res = await fetch(`/api/dashboard/${dashboardId}/share`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }),
    })
    if (res.ok) { setShares(prev => prev.filter(s => s.userId !== userId)); toast.success('Access revoked') }
    else toast.error('Failed to revoke')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Share2 className="w-4 h-4 text-primary" /> Share &quot;{dashboardName}&quot;</DialogTitle>
          <DialogDescription>People you share with can open and collaborate on this dashboard. They get an in-app notification and an email (if SMTP is configured).</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {shares.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Currently shared with</Label>
              <div className="flex flex-wrap gap-1.5">
                {shares.map(s => (
                  <span key={s.id} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-[11px]">
                    {s.user?.name ?? s.user?.email}
                    <button onClick={() => revoke(s.userId)} className="p-0.5 rounded-full hover:bg-white/10" title="Revoke"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Pick users</Label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name or email" className="pl-8 h-8 text-xs" />
            </div>
            <div className="max-h-44 overflow-y-auto rounded-lg border border-white/10 divide-y divide-white/5">
              {loading ? (
                <div className="p-4 text-center text-xs text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline" /></div>
              ) : candidates.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">No more users to add</div>
              ) : candidates.map(u => (
                <label key={u.id} className="flex items-center gap-3 px-3 py-2 hover:bg-white/5 cursor-pointer">
                  <Checkbox checked={selected.has(u.id)} onCheckedChange={() => toggle(u.id)} />
                  <div className="min-w-0">
                    <div className="text-xs text-foreground truncate">{u.name ?? u.email}</div>
                    {u.name && <div className="text-[10px] text-muted-foreground truncate">{u.email}</div>}
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sh-emails" className="text-xs">Or enter emails (comma separated, must be existing accounts)</Label>
            <Input id="sh-emails" value={extraEmails} onChange={e => setExtraEmails(e.target.value)} placeholder="alice@company.com, bob@company.com" className="h-8 text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sh-msg" className="text-xs">Message (optional)</Label>
            <Textarea id="sh-msg" value={message} onChange={e => setMessage(e.target.value)} rows={2} placeholder="Have a look at the Q3 fleet overview" className="text-xs" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={submit} disabled={sending} className="gap-1">
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />} Share &amp; notify
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
