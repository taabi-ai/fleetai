'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Coins, Pencil, Gift, Check, X, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SafeDate } from '@/components/safe-format'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { toast } from 'sonner'
import { PageHeader, Panel, Field, readErr } from '../_components/ui-bits'
import { fmtTokens } from '@/components/usage-dialog'

type Row = {
  user: { id: string; name?: string | null; email: string; role: string; isActive: boolean }
  used: number; promptTokens: number; completionTokens: number; requests: number; allTimeTokens: number; allTimeRequests: number; lastUsedAt: string | null
  baseLimit: number; bonus: number; limit: number; percent: number; remaining: number; hardLimit: boolean; isCustom: boolean; note: string | null; exceeded: boolean; warn: boolean
}
type Data = {
  month: string; defaults: { defaultMonthlyTokens: number; warnPercent: number }; rows: Row[]
  totals: { used: number; requests: number; prompt: number; completion: number }; pendingRequests: number
  daily: { day: string; tokens: number; requests: number }[]; byModel: { provider: string; model: string; tokens: number; requests: number }[]
}
type CReq = { id: string; userId: string; tokens: number; reason?: string | null; status: string; reviewNote?: string | null; createdAt: string; reviewedAt?: string | null; user?: { email: string; name?: string | null; role: string } | null }

export default function UsagePage() {
  const [data, setData] = useState<Data | null>(null)
  const [reqs, setReqs] = useState<CReq[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [defaults, setDefaults] = useState({ defaultMonthlyTokens: '', warnPercent: '' })
  const [savingDefaults, setSavingDefaults] = useState(false)

  const [quotaFor, setQuotaFor] = useState<Row | null>(null)
  const [quotaForm, setQuotaForm] = useState({ custom: false, monthlyLimit: '', hardLimit: true, note: '' })
  const [grantFor, setGrantFor] = useState<Row | null>(null)
  const [grantForm, setGrantForm] = useState({ tokens: '50000', note: '' })
  const [review, setReview] = useState<{ req: CReq; decision: 'approved' | 'rejected' } | null>(null)
  const [reviewForm, setReviewForm] = useState({ tokens: '', note: '' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [a, b] = await Promise.all([fetch('/api/admin/usage'), fetch('/api/admin/credit-requests')])
    if (a.ok) {
      const d: Data = await a.json()
      setData(d)
      setDefaults({ defaultMonthlyTokens: String(d.defaults.defaultMonthlyTokens), warnPercent: String(d.defaults.warnPercent) })
    }
    if (b.ok) setReqs(await b.json())
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (data?.rows ?? []).filter(r => !s || r.user.email.toLowerCase().includes(s) || (r.user.name ?? '').toLowerCase().includes(s) || r.user.role.includes(s))
  }, [data, q])

  const saveDefaults = async () => {
    setSavingDefaults(true)
    try {
      const res = await fetch('/api/admin/usage', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ defaultMonthlyTokens: Number(defaults.defaultMonthlyTokens), warnPercent: Number(defaults.warnPercent) }) })
      if (!res.ok) { toast.error(await readErr(res, 'Failed to save')); return }
      toast.success('Platform defaults saved')
      load()
    } finally { setSavingDefaults(false) }
  }

  const openQuota = (r: Row) => { setQuotaFor(r); setQuotaForm({ custom: r.isCustom, monthlyLimit: r.isCustom ? String(r.baseLimit) : '', hardLimit: r.hardLimit, note: r.note ?? '' }) }
  const saveQuota = async () => {
    if (!quotaFor) return
    setBusy(true)
    try {
      const body = { monthlyLimit: quotaForm.custom ? Number(quotaForm.monthlyLimit || 0) : null, hardLimit: quotaForm.hardLimit, note: quotaForm.note }
      const res = await fetch(`/api/admin/usage/${quotaFor.user.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) { toast.error(await readErr(res, 'Failed to save quota')); return }
      toast.success('Quota updated'); setQuotaFor(null); load()
    } finally { setBusy(false) }
  }

  const grant = async () => {
    if (!grantFor) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/usage/${grantFor.user.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokens: Number(grantForm.tokens), note: grantForm.note }) })
      if (!res.ok) { toast.error(await readErr(res, 'Failed to grant credits')); return }
      toast.success('Credits granted and user notified'); setGrantFor(null); load()
    } finally { setBusy(false) }
  }

  const doReview = async () => {
    if (!review) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/credit-requests', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: review.req.id, decision: review.decision, tokens: reviewForm.tokens ? Number(reviewForm.tokens) : undefined, note: reviewForm.note }) })
      if (!res.ok) { toast.error(await readErr(res, 'Failed to review')); return }
      toast.success(review.decision === 'approved' ? 'Request approved' : 'Request declined'); setReview(null); load()
    } finally { setBusy(false) }
  }

  const pending = reqs.filter(r => r.status === 'pending')

  return (
    <div>
      <PageHeader
        title="LLM usage & quotas"
        description="Token consumption matrix for every platform user, monthly quotas, bonus credits and credit requests. Usage is captured from provider responses; rows marked estimated were computed when a provider did not return usage."
        actions={<Button size="sm" variant="outline" onClick={load}><RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh</Button>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[
          { label: `Tokens · ${data?.month ?? ''}`, value: data ? data.totals.used.toLocaleString('en-US') : '—' },
          { label: 'Requests this month', value: data ? data.totals.requests.toLocaleString('en-US') : '—' },
          { label: 'Prompt / completion', value: data ? `${fmtTokens(data.totals.prompt)} / ${fmtTokens(data.totals.completion)}` : '—' },
          { label: 'Pending credit requests', value: data?.pendingRequests ?? '—', tone: (data?.pendingRequests ?? 0) > 0 ? 'text-amber-500' : '' },
        ].map(s => (
          <Panel key={s.label} className="p-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{s.label}</div>
            <div className={`font-mono text-2xl font-semibold mt-1 ${s.tone ?? ''}`}>{s.value}</div>
          </Panel>
        ))}
      </div>

      <Tabs defaultValue="matrix">
        <TabsList className="mb-3">
          <TabsTrigger value="matrix">Consumption matrix</TabsTrigger>
          <TabsTrigger value="requests">Credit requests {pending.length > 0 && <Badge className="ml-1.5 h-4 px-1.5 text-[10px]">{pending.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="trends">Trends & models</TabsTrigger>
          <TabsTrigger value="defaults">Platform defaults</TabsTrigger>
        </TabsList>

        <TabsContent value="matrix">
          <Panel>
            <div className="p-3 border-b border-border flex items-center gap-2">
              <div className="relative flex-1 max-w-xs">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input className="pl-8 h-8 text-xs" placeholder="Filter users…" value={q} onChange={e => setQ(e.target.value)} />
              </div>
              <span className="text-xs text-muted-foreground">{rows.length} users</span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead className="w-[240px]">Month usage</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                  <TableHead className="text-right">Limit</TableHead>
                  <TableHead className="text-right">Bonus</TableHead>
                  <TableHead className="text-right">All time</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && !data && <TableRow><TableCell colSpan={8} className="text-center py-10"><Loader2 className="w-4 h-4 animate-spin inline" /></TableCell></TableRow>}
                {rows.map(r => (
                  <TableRow key={r.user.id}>
                    <TableCell>
                      <div className="text-xs font-medium truncate max-w-[200px]">{r.user.name || r.user.email}</div>
                      <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">{r.user.email} · {r.user.role}{!r.user.isActive && ' · inactive'}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-mono">{r.used.toLocaleString('en-US')}</span>
                        <span className={`text-[11px] ${r.exceeded ? 'text-red-500' : r.warn ? 'text-amber-500' : 'text-muted-foreground'}`}>{r.limit === 0 ? 'unlimited' : `${r.percent}%`}</span>
                      </div>
                      {r.limit !== 0 && <Progress value={Math.min(100, r.percent)} className={`h-1.5 ${r.exceeded ? '[&>div]:bg-red-500' : r.warn ? '[&>div]:bg-amber-500' : '[&>div]:bg-emerald-500'}`} />}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">{r.requests}</TableCell>
                    <TableCell className="text-right text-xs">
                      <span className="font-mono">{r.baseLimit === 0 ? '∞' : fmtTokens(r.baseLimit)}</span>
                      <div className="text-[10px] text-muted-foreground">{r.isCustom ? 'custom' : 'default'}{!r.hardLimit && ' · soft'}</div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">{r.bonus ? `+${fmtTokens(r.bonus)}` : '—'}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">{fmtTokens(r.allTimeTokens)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.lastUsedAt ? <SafeDate date={r.lastUsedAt} options={{ dateStyle: 'medium' }} /> : 'never'}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" className="h-7 px-2" title="Edit quota" onClick={() => openQuota(r)}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" title="Grant credits" onClick={() => { setGrantFor(r); setGrantForm({ tokens: '50000', note: '' }) }}><Gift className="w-3.5 h-3.5" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        </TabsContent>

        <TabsContent value="requests">
          <Panel>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Review</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reqs.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-10 text-xs text-muted-foreground">No credit requests yet.</TableCell></TableRow>}
                {reqs.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{r.user?.email ?? r.userId}<div className="text-[10px] text-muted-foreground">{r.user?.role}</div></TableCell>
                    <TableCell className="text-right font-mono text-xs">{r.tokens.toLocaleString('en-US')}</TableCell>
                    <TableCell className="text-xs max-w-[280px] truncate" title={r.reason ?? ''}>{r.reason || <span className="text-muted-foreground">—</span>}{r.reviewNote && <div className="text-[10px] text-muted-foreground truncate">Review: {r.reviewNote}</div>}</TableCell>
                    <TableCell className="text-xs text-muted-foreground"><SafeDate date={r.createdAt} options={{ dateStyle: 'medium', timeStyle: 'short' }} /></TableCell>
                    <TableCell><Badge variant="outline" className={`text-[10px] ${r.status === 'approved' ? 'text-emerald-500 border-emerald-500/40' : r.status === 'rejected' ? 'text-red-500 border-red-500/40' : 'text-amber-500 border-amber-500/40'}`}>{r.status}</Badge></TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {r.status === 'pending' && (
                        <>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-emerald-500" onClick={() => { setReview({ req: r, decision: 'approved' }); setReviewForm({ tokens: String(r.tokens), note: '' }) }}><Check className="w-3.5 h-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-red-500" onClick={() => { setReview({ req: r, decision: 'rejected' }); setReviewForm({ tokens: '', note: '' }) }}><X className="w-3.5 h-3.5" /></Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        </TabsContent>

        <TabsContent value="trends">
          <div className="grid lg:grid-cols-3 gap-4">
            <Panel className="p-4 lg:col-span-2">
              <div className="text-xs font-medium mb-3">Daily tokens — last 30 days</div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data?.daily ?? []} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                    <defs><linearGradient id="tok" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} /><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmtTokens(v)} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12, color: 'hsl(var(--popover-foreground))' }} formatter={(v: any) => [Number(v).toLocaleString('en-US'), 'tokens']} />
                    <Area type="monotone" dataKey="tokens" stroke="hsl(var(--primary))" fill="url(#tok)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel className="p-4">
              <div className="text-xs font-medium mb-3">By model · this month</div>
              <div className="space-y-2">
                {(data?.byModel ?? []).length === 0 && <div className="text-xs text-muted-foreground">No usage recorded yet.</div>}
                {(data?.byModel ?? []).map(m => (
                  <div key={`${m.provider}-${m.model}`} className="text-xs">
                    <div className="flex justify-between"><span className="truncate">{m.model}</span><span className="font-mono">{fmtTokens(m.tokens)}</span></div>
                    <div className="text-[10px] text-muted-foreground">{m.provider} · {m.requests} requests</div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="defaults">
          <Panel className="p-5 max-w-xl space-y-4">
            <Field label="Default monthly token allowance" hint="Applies to every user without a custom quota. 0 = unlimited.">
              <Input type="number" min={0} step={1000} value={defaults.defaultMonthlyTokens} onChange={e => setDefaults(d => ({ ...d, defaultMonthlyTokens: e.target.value }))} className="h-8 text-xs" />
            </Field>
            <Field label="Warning threshold (%)" hint="Users at or above this share of their quota are highlighted in amber.">
              <Input type="number" min={1} max={100} value={defaults.warnPercent} onChange={e => setDefaults(d => ({ ...d, warnPercent: e.target.value }))} className="h-8 text-xs w-32" />
            </Field>
            <div className="flex justify-end"><Button size="sm" onClick={saveDefaults} disabled={savingDefaults}>{savingDefaults && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />} Save defaults</Button></div>
          </Panel>
        </TabsContent>
      </Tabs>

      {/* Edit quota */}
      <Dialog open={!!quotaFor} onOpenChange={o => !o && setQuotaFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Quota for {quotaFor?.user.email}</DialogTitle>
            <DialogDescription>Set a custom monthly allowance or fall back to the platform default ({data?.defaults.defaultMonthlyTokens.toLocaleString('en-US')} tokens).</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between"><span className="text-xs">Custom monthly limit</span><Switch checked={quotaForm.custom} onCheckedChange={v => setQuotaForm(f => ({ ...f, custom: v }))} /></div>
            {quotaForm.custom && (
              <Field label="Monthly tokens" hint="0 = unlimited">
                <Input type="number" min={0} step={1000} value={quotaForm.monthlyLimit} onChange={e => setQuotaForm(f => ({ ...f, monthlyLimit: e.target.value }))} className="h-8 text-xs" />
              </Field>
            )}
            <div className="flex items-center justify-between">
              <div><div className="text-xs">Hard limit</div><div className="text-[11px] text-muted-foreground">Block AI requests once the quota is reached. Off = warn only.</div></div>
              <Switch checked={quotaForm.hardLimit} onCheckedChange={v => setQuotaForm(f => ({ ...f, hardLimit: v }))} />
            </div>
            <Field label="Admin note"><Textarea value={quotaForm.note} onChange={e => setQuotaForm(f => ({ ...f, note: e.target.value }))} className="text-xs min-h-[56px]" /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setQuotaFor(null)}>Cancel</Button>
            <Button size="sm" onClick={saveQuota} disabled={busy}>{busy && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />} Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Grant credits */}
      <Dialog open={!!grantFor} onOpenChange={o => !o && setGrantFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Coins className="w-4 h-4 text-primary" /> Grant credits to {grantFor?.user.email}</DialogTitle>
            <DialogDescription>Bonus tokens apply to the current month only. Use a negative number to revoke bonus tokens.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Tokens"><Input type="number" step={1000} value={grantForm.tokens} onChange={e => setGrantForm(f => ({ ...f, tokens: e.target.value }))} className="h-8 text-xs" /></Field>
            <div className="flex gap-1.5">{[25000, 50000, 100000, 250000, 1000000].map(n => <Button key={n} size="sm" variant="outline" className="h-7 text-xs" onClick={() => setGrantForm(f => ({ ...f, tokens: String(n) }))}>+{fmtTokens(n)}</Button>)}</div>
            <Field label="Note to user (optional)"><Textarea value={grantForm.note} onChange={e => setGrantForm(f => ({ ...f, note: e.target.value }))} className="text-xs min-h-[56px]" /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setGrantFor(null)}>Cancel</Button>
            <Button size="sm" onClick={grant} disabled={busy}>{busy && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />} Grant</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review request */}
      <Dialog open={!!review} onOpenChange={o => !o && setReview(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{review?.decision === 'approved' ? 'Approve' : 'Decline'} credit request</DialogTitle>
            <DialogDescription>{review?.req.user?.email} asked for {review?.req.tokens.toLocaleString('en-US')} tokens.{review?.req.reason ? ` Reason: ${review.req.reason}` : ''}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {review?.decision === 'approved' && <Field label="Tokens to grant"><Input type="number" min={1} step={1000} value={reviewForm.tokens} onChange={e => setReviewForm(f => ({ ...f, tokens: e.target.value }))} className="h-8 text-xs" /></Field>}
            <Field label="Note to user (optional)"><Textarea value={reviewForm.note} onChange={e => setReviewForm(f => ({ ...f, note: e.target.value }))} className="text-xs min-h-[56px]" /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setReview(null)}>Cancel</Button>
            <Button size="sm" variant={review?.decision === 'rejected' ? 'destructive' : 'default'} onClick={doReview} disabled={busy}>{busy && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />} {review?.decision === 'approved' ? 'Approve & grant' : 'Decline'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
