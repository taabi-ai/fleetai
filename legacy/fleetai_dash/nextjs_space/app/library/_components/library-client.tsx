'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { AppNav } from '@/components/app-nav'
import { PinSettingsDialog } from '@/components/pin-settings-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { SafeDate } from '@/components/safe-format'
import { Library, Plus, Search, Trash2, Loader2, User, Download, LayoutDashboard, Check } from 'lucide-react'
import { toast } from 'sonner'
import { typeLabel, typeColor, DATA_SOURCE_LABELS, displayName } from '@/lib/widget-meta'

type LibraryItem = {
  id: string
  ownerId: string
  title: string
  description?: string | null
  widgetConfig: any
  gridPos: any
  useCount: number
  createdAt: string
  owner: { id: string; name?: string | null; email?: string | null }
}

type DashboardLite = { id: string; name: string; isPublished?: boolean }

export function LibraryClient() {
  const { data: session } = useSession() || {}
  const userId = session?.user?.id
  const router = useRouter()
  const [items, setItems] = useState<LibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [mineOnly, setMineOnly] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)

  const [target, setTarget] = useState<LibraryItem | null>(null)
  const [dashboards, setDashboards] = useState<DashboardLite[]>([])
  const [selectedDash, setSelectedDash] = useState<string>('')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/library')
      if (res.ok) setItems(await res.json())
      else toast.error('Failed to load library')
    } catch {
      toast.error('Failed to load library')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const types = useMemo(() => Array.from(new Set(items.map(i => i.widgetConfig?.type).filter(Boolean))) as string[], [items])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter(i => {
      if (mineOnly && i.ownerId !== userId) return false
      if (typeFilter !== 'all' && i.widgetConfig?.type !== typeFilter) return false
      if (!q) return true
      return (
        i.title.toLowerCase().includes(q) ||
        (i.description ?? '').toLowerCase().includes(q) ||
        (i.widgetConfig?.dataSource ?? '').toLowerCase().includes(q) ||
        displayName(i.owner).toLowerCase().includes(q)
      )
    })
  }, [items, query, typeFilter, mineOnly, userId])

  const openAdd = useCallback(async (item: LibraryItem) => {
    setTarget(item)
    try {
      const res = await fetch('/api/dashboard')
      if (res.ok) {
        const list: DashboardLite[] = await res.json()
        setDashboards(list)
        setSelectedDash(list[0]?.id ?? '')
      }
    } catch { /* silent */ }
  }, [])

  const confirmAdd = useCallback(async () => {
    if (!target || !selectedDash) return
    setAdding(true)
    try {
      const res = await fetch(`/api/library/${target.id}/use`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dashboardId: selectedDash }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data?.error ?? 'Failed to add widget')
        return
      }
      setItems(prev => prev.map(i => i.id === target.id ? { ...i, useCount: i.useCount + 1 } : i))
      const dashName = dashboards.find(d => d.id === selectedDash)?.name ?? 'dashboard'
      toast.success(`Added "${target.title}" to ${dashName}`, {
        action: { label: 'Open', onClick: () => router.push(`/dashboard?dashboard=${selectedDash}`) },
      })
      setTarget(null)
    } catch {
      toast.error('Failed to add widget')
    } finally {
      setAdding(false)
    }
  }, [target, selectedDash, dashboards, router])

  const remove = useCallback(async (item: LibraryItem) => {
    if (!window.confirm(`Remove "${item.title}" from the library?`)) return
    try {
      const res = await fetch(`/api/library/${item.id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Failed to remove'); return }
      setItems(prev => prev.filter(i => i.id !== item.id))
      toast.success('Removed from library')
    } catch {
      toast.error('Failed to remove')
    }
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <AppNav onOpenPinSettings={() => setPinOpen(true)} />
      <PinSettingsDialog open={pinOpen} onOpenChange={setPinOpen} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-primary mb-1">
              <Library className="w-5 h-5" />
              <span className="text-xs font-medium uppercase tracking-wider">Shared widgets</span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-foreground">Widget Library</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
              Widgets published by your team. Add any of them to your own dashboards in one click, or publish yours from a widget&apos;s menu on the dashboard.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search widgets…" className="pl-8 w-56 bg-card border-white/10" />
            </div>
            <Button variant={mineOnly ? 'default' : 'outline'} size="sm" onClick={() => setMineOnly(v => !v)} className="text-xs gap-1 border-white/10">
              <User className="w-3 h-3" /> Mine
            </Button>
          </div>
        </div>

        {types.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setTypeFilter('all')}
              className={`text-xs px-3 py-1 rounded-full border transition ${typeFilter === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'border-white/10 text-muted-foreground hover:text-foreground'}`}
            >
              All types
            </button>
            {types.map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`text-xs px-3 py-1 rounded-full border transition ${typeFilter === t ? 'bg-primary text-primary-foreground border-primary' : 'border-white/10 text-muted-foreground hover:text-foreground'}`}
              >
                {typeLabel(t)}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-44 rounded-xl bg-card/60 border border-white/5 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Library className="w-8 h-8 text-primary" />
            </div>
            <h2 className="font-display text-lg font-semibold">{items.length === 0 ? 'The library is empty' : 'No widgets match your filters'}</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              {items.length === 0
                ? 'Publish a widget from your dashboard — open a widget’s menu (⋯) and choose “Publish to Library”.'
                : 'Try a different search term or clear the filters.'}
            </p>
            <Button className="mt-5 gap-2" onClick={() => router.push('/dashboard')}>
              <LayoutDashboard className="w-4 h-4" /> Go to my dashboard
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(item => {
              const cfg = item.widgetConfig ?? {}
              const mine = item.ownerId === userId
              return (
                <div key={item.id} className="group relative rounded-xl bg-card border border-white/10 p-4 flex flex-col gap-3 shadow-lg shadow-black/20 hover:border-primary/40 transition">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${typeColor(cfg.type)}`}>{typeLabel(cfg.type)}</span>
                      {cfg.dataSource && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-white/10 text-muted-foreground">
                          {DATA_SOURCE_LABELS[cfg.dataSource] ?? cfg.dataSource}
                        </span>
                      )}
                    </div>
                    {mine && (
                      <button onClick={() => remove(item)} title="Remove from library" className="text-muted-foreground hover:text-destructive transition p-1 -m-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-display font-semibold text-foreground leading-snug">{item.title}</h3>
                    {item.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</p>}
                    {cfg.metric && <p className="text-[11px] font-mono text-muted-foreground/80 mt-2 truncate">metric: {cfg.metric}</p>}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-white/5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-semibold shrink-0">
                        {displayName(item.owner).charAt(0).toUpperCase()}
                      </div>
                      <span className="truncate">{mine ? 'You' : displayName(item.owner)}</span>
                      <span>·</span>
                      <SafeDate date={item.createdAt} options={{ dateStyle: 'medium' }} />
                    </div>
                    <span className="flex items-center gap-1 shrink-0"><Download className="w-3 h-3" /> {item.useCount}</span>
                  </div>
                  <Button size="sm" onClick={() => openAdd(item)} className="w-full gap-1.5 text-xs">
                    <Plus className="w-3.5 h-3.5" /> Add to dashboard
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </main>

      <Dialog open={!!target} onOpenChange={(o) => { if (!o) setTarget(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add to dashboard</DialogTitle>
            <DialogDescription>Choose which of your dashboards should receive &quot;{target?.title}&quot;.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Dashboard</Label>
            {dashboards.length === 0 ? (
              <p className="text-xs text-muted-foreground">Loading your dashboards…</p>
            ) : (
              <div className="max-h-60 overflow-y-auto rounded-lg border border-white/10 divide-y divide-white/5">
                {dashboards.map(d => (
                  <button
                    key={d.id}
                    onClick={() => setSelectedDash(d.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition ${selectedDash === d.id ? 'bg-primary/15 text-foreground' : 'hover:bg-white/5 text-muted-foreground'}`}
                  >
                    {selectedDash === d.id ? <Check className="w-4 h-4 text-primary" /> : <span className="w-4" />}
                    <span className="truncate flex-1">{d.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)}>Cancel</Button>
            <Button onClick={confirmAdd} disabled={!selectedDash || adding} className="gap-1.5">
              {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add widget
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
