'use client'

import { useCallback, useEffect, useState } from 'react'
import { Coins, Loader2, Send } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { SafeDate } from '@/components/safe-format'
import { toast } from 'sonner'

export const OPEN_USAGE_EVENT = 'fleetai:open-usage'

type Quota = { month: string; used: number; requests: number; limit: number; baseLimit: number; bonus: number; remaining: number; percent: number; hardLimit: boolean; exceeded: boolean; warn: boolean }
type Req = { id: string; tokens: number; reason?: string | null; status: string; reviewNote?: string | null; createdAt: string }
type Recent = { id: string; model: string; providerName: string; feature: string; totalTokens: number; estimated: boolean; success: boolean; createdAt: string }
type Data = { quota: Quota; requests: Req[]; recent: Recent[]; daily: { day: string; tokens: number }[] }

export function fmtTokens(n: number) {
  if (n < 0) return '∞'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`
  return String(n)
}

export function UsageDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [tokens, setTokens] = useState('100000')
  const [reason, setReason] = useState('')
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/usage/me')
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [])
  useEffect(() => { if (open) load() }, [open, load])

  const submit = async () => {
    setSending(true)
    try {
      const res = await fetch('/api/usage/me', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokens: Number(tokens), reason }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d?.error ?? 'Could not submit request'); return }
      toast.success('Request sent to the platform admins')
      setReason('')
      load()
    } finally { setSending(false) }
  }

  const q = data?.quota
  const pct = q ? Math.min(100, q.percent) : 0
  const bar = q?.exceeded ? '[&>div]:bg-red-500' : q?.warn ? '[&>div]:bg-amber-500' : '[&>div]:bg-emerald-500'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Coins className="w-4 h-4 text-primary" /> AI usage & credits</DialogTitle>
          <DialogDescription>Your LLM token consumption for {q?.month ?? 'this month'} and your credit requests.</DialogDescription>
        </DialogHeader>

        {loading && !data ? (
          <div className="py-10 text-center"><Loader2 className="w-4 h-4 animate-spin inline" /></div>
        ) : q ? (
          <div className="space-y-5">
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Used this month</div>
                  <div className="font-mono text-2xl font-semibold">{q.used.toLocaleString('en-US')} <span className="text-sm text-muted-foreground">/ {q.limit === 0 ? 'unlimited' : q.limit.toLocaleString('en-US')} tokens</span></div>
                </div>
                <Badge variant="outline" className={q.exceeded ? 'border-red-500/40 text-red-500' : q.warn ? 'border-amber-500/40 text-amber-500' : 'border-emerald-500/40 text-emerald-500'}>
                  {q.limit === 0 ? 'Unlimited' : q.exceeded ? (q.hardLimit ? 'Limit reached' : 'Over soft limit') : `${q.percent}% used`}
                </Badge>
              </div>
              {q.limit !== 0 && <Progress value={pct} className={`h-2 mt-3 ${bar}`} />}
              <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                <div><div className="text-muted-foreground">Requests</div><div className="font-mono">{q.requests}</div></div>
                <div><div className="text-muted-foreground">Bonus credits</div><div className="font-mono">{q.bonus.toLocaleString('en-US')}</div></div>
                <div><div className="text-muted-foreground">Remaining</div><div className="font-mono">{q.remaining < 0 ? '∞' : q.remaining.toLocaleString('en-US')}</div></div>
              </div>
            </div>

            {data && data.daily.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Last 30 days</div>
                <div className="flex items-end gap-[2px] h-12">
                  {data.daily.map(d => {
                    const max = Math.max(...data.daily.map(x => x.tokens), 1)
                    return <div key={d.day} title={`${d.day}: ${d.tokens.toLocaleString('en-US')} tokens`} className="flex-1 bg-primary/70 rounded-sm min-h-[2px]" style={{ height: `${Math.max(4, (d.tokens / max) * 100)}%` }} />
                  })}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-border p-4 space-y-2">
              <div className="text-xs font-medium">Request more credits</div>
              <div className="flex gap-2">
                <Input type="number" min={1000} step={1000} value={tokens} onChange={e => setTokens(e.target.value)} className="h-8 text-xs w-36" />
                <span className="text-xs text-muted-foreground self-center">tokens ({fmtTokens(Number(tokens) || 0)})</span>
              </div>
              <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Why do you need more? (optional)" className="text-xs min-h-[56px]" />
              <div className="flex justify-end">
                <Button size="sm" onClick={submit} disabled={sending}>{sending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Send className="w-3.5 h-3.5 mr-1.5" />} Send request</Button>
              </div>
            </div>

            {data && data.requests.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Your requests</div>
                <div className="space-y-1 max-h-32 overflow-auto">
                  {data.requests.map(r => (
                    <div key={r.id} className="flex items-center justify-between text-xs rounded-md border border-border px-2.5 py-1.5">
                      <div className="min-w-0">
                        <span className="font-mono">{r.tokens.toLocaleString('en-US')}</span> tokens
                        <span className="text-muted-foreground"> · <SafeDate date={r.createdAt} options={{ dateStyle: 'medium' }} /></span>
                        {r.reviewNote && <div className="text-[11px] text-muted-foreground truncate">{r.reviewNote}</div>}
                      </div>
                      <Badge variant="outline" className={`text-[10px] ${r.status === 'approved' ? 'text-emerald-500 border-emerald-500/40' : r.status === 'rejected' ? 'text-red-500 border-red-500/40' : 'text-amber-500 border-amber-500/40'}`}>{r.status}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-muted-foreground">Could not load usage.</div>
        )}
      </DialogContent>
    </Dialog>
  )
}
