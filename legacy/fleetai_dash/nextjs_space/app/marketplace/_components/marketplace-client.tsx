'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { AppNav } from '@/components/app-nav'
import { PinSettingsDialog } from '@/components/pin-settings-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SafeDate } from '@/components/safe-format'
import { Store, Search, Copy, ExternalLink, Loader2, LayoutDashboard, Users, Globe } from 'lucide-react'
import { toast } from 'sonner'
import { typeLabel, typeColor, displayName } from '@/lib/widget-meta'

type MarketItem = {
  id: string
  name: string
  description?: string | null
  userId: string
  isPublished: boolean
  publishedAt?: string | null
  cloneCount: number
  updatedAt: string
  user: { id: string; name?: string | null; email?: string | null }
  widgets: { id: string; widgetConfig: any }[]
}

export function MarketplaceClient() {
  const { data: session } = useSession() || {}
  const userId = session?.user?.id
  const router = useRouter()
  const [items, setItems] = useState<MarketItem[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [cloning, setCloning] = useState<string | null>(null)
  const [pinOpen, setPinOpen] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/marketplace')
        if (res.ok) setItems(await res.json())
        else toast.error('Failed to load marketplace')
      } catch {
        toast.error('Failed to load marketplace')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.description ?? '').toLowerCase().includes(q) ||
      displayName(i.user).toLowerCase().includes(q) ||
      i.widgets.some(w => (w.widgetConfig?.title ?? '').toLowerCase().includes(q))
    )
  }, [items, query])

  const clone = useCallback(async (item: MarketItem) => {
    setCloning(item.id)
    try {
      const res = await fetch(`/api/marketplace/${item.id}/clone`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data?.error ?? 'Failed to clone dashboard')
        return
      }
      const d = await res.json()
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, cloneCount: i.cloneCount + 1 } : i))
      toast.success(`Cloned "${item.name}" to your dashboards`)
      router.push(`/dashboard?dashboard=${d.id}`)
    } catch {
      toast.error('Failed to clone dashboard')
    } finally {
      setCloning(null)
    }
  }, [router])

  return (
    <div className="min-h-screen bg-background">
      <AppNav onOpenPinSettings={() => setPinOpen(true)} />
      <PinSettingsDialog open={pinOpen} onOpenChange={setPinOpen} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-primary mb-1">
              <Store className="w-5 h-5" />
              <span className="text-xs font-medium uppercase tracking-wider">Internal marketplace</span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-foreground">Dashboard Marketplace</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
              Dashboards published by your team. Open one to collaborate live (widgets can be locked while you edit), or clone it into your own workspace.
            </p>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search dashboards…" className="pl-8 w-64 bg-card border-white/10" />
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-52 rounded-xl bg-card/60 border border-white/5 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Store className="w-8 h-8 text-primary" />
            </div>
            <h2 className="font-display text-lg font-semibold">{items.length === 0 ? 'Nothing published yet' : 'No dashboards match your search'}</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              {items.length === 0
                ? 'Publish one of your dashboards with the “Publish” button in the dashboard header and it will appear here for everyone.'
                : 'Try a different search term.'}
            </p>
            <Button className="mt-5 gap-2" onClick={() => router.push('/dashboard')}>
              <LayoutDashboard className="w-4 h-4" /> Go to my dashboard
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(item => {
              const mine = item.userId === userId
              const typeCounts = item.widgets.reduce<Record<string, number>>((acc, w) => {
                const t = w.widgetConfig?.type ?? 'other'
                acc[t] = (acc[t] ?? 0) + 1
                return acc
              }, {})
              return (
                <div key={item.id} className="rounded-xl bg-card border border-white/10 p-5 flex flex-col gap-4 shadow-lg shadow-black/20 hover:border-primary/40 transition">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-display font-semibold text-foreground text-lg leading-snug truncate">{item.name}</h3>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2 min-h-[2rem]">
                        {item.description || 'No description provided.'}
                      </p>
                    </div>
                    <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">
                      <Globe className="w-3 h-3" /> {mine ? 'Yours' : 'Shared'}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(typeCounts).map(([t, n]) => (
                      <span key={t} className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${typeColor(t)}`}>
                        {n} × {typeLabel(t)}
                      </span>
                    ))}
                    {item.widgets.length === 0 && <span className="text-[10px] text-muted-foreground">No widgets yet</span>}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-3 border-t border-white/5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-semibold shrink-0">
                        {displayName(item.user).charAt(0).toUpperCase()}
                      </div>
                      <span className="truncate">{mine ? 'You' : displayName(item.user)}</span>
                      {item.publishedAt && (<><span>·</span><SafeDate date={item.publishedAt} options={{ dateStyle: 'medium' }} /></>)}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="flex items-center gap-1"><LayoutDashboard className="w-3 h-3" /> {item.widgets.length}</span>
                      <span className="flex items-center gap-1"><Copy className="w-3 h-3" /> {item.cloneCount}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" onClick={() => router.push(`/dashboard?dashboard=${item.id}`)} className="text-xs gap-1.5 border-white/10">
                      {mine ? <ExternalLink className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />} {mine ? 'Open' : 'Open & collaborate'}
                    </Button>
                    <Button size="sm" onClick={() => clone(item)} disabled={cloning === item.id} className="text-xs gap-1.5">
                      {cloning === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />} Clone to mine
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
