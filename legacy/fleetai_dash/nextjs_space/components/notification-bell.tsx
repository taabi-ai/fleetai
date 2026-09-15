'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Check, CheckCheck, Share2, Globe, Info, Trash2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'

type Notif = { id: string; type: string; title: string; message: string; link?: string | null; read: boolean; createdAt: string }

function timeAgo(iso: string, now: number) {
  const diff = Math.max(0, now - new Date(iso).getTime())
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function TypeIcon({ type }: { type: string }) {
  if (type === 'share') return <Share2 className="w-3.5 h-3.5 text-primary" />
  if (type === 'publish') return <Globe className="w-3.5 h-3.5 text-emerald-400" />
  return <Info className="w-3.5 h-3.5 text-muted-foreground" />
}

export function NotificationBell() {
  const [items, setItems] = useState<Notif[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [now, setNow] = useState(0)
  const router = useRouter()
  const timer = useRef<NodeJS.Timeout | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' })
      if (!res.ok) return
      const d = await res.json()
      setNow(Date.now())
      setItems(Array.isArray(d.items) ? d.items : [])
      setUnread(Number(d.unread) || 0)
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    setMounted(true)
    load()
    timer.current = setInterval(load, 20000)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [load])

  const markRead = async (ids: string[]) => {
    if (ids.length === 0) return
    setItems(prev => prev.map(n => ids.includes(n.id) ? { ...n, read: true } : n))
    setUnread(prev => Math.max(0, prev - ids.length))
    await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) }).catch(() => {})
  }

  const markAll = async () => {
    setItems(prev => prev.map(n => ({ ...n, read: true })))
    setUnread(0)
    await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) }).catch(() => {})
  }

  const clearAll = async () => {
    setItems([]); setUnread(0)
    await fetch('/api/notifications', { method: 'DELETE' }).catch(() => {})
  }

  const openItem = (n: Notif) => {
    if (!n.read) markRead([n.id])
    setOpen(false)
    if (n.link) router.push(n.link)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          title="Notifications"
          aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
        >
          <Bell className="w-4 h-4" />
          {mounted && unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center border-2 border-card">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 border-white/10 bg-card">
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
          <div className="text-xs font-semibold">Notifications {unread > 0 && <span className="ml-1 text-[10px] text-primary">{unread} new</span>}</div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1" onClick={markAll} disabled={unread === 0} title="Mark all read"><CheckCheck className="w-3 h-3" /> Read all</Button>
            <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px]" onClick={clearAll} disabled={items.length === 0} title="Clear all"><Trash2 className="w-3 h-3" /></Button>
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              <Bell className="w-6 h-6 mx-auto mb-2 opacity-40" />
              You&apos;re all caught up
            </div>
          ) : items.map(n => (
            <button
              key={n.id}
              onClick={() => openItem(n)}
              className={`w-full text-left flex gap-2.5 px-3 py-2.5 border-b border-white/5 hover:bg-white/5 transition-colors ${n.read ? 'opacity-70' : 'bg-primary/5'}`}
            >
              <div className="mt-0.5 flex-shrink-0"><TypeIcon type={n.type} /></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium truncate">{n.title}</span>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">{timeAgo(n.createdAt, now)}</span>
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>
              </div>
              {!n.read && <span className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />}
              {n.read && <Check className="w-3 h-3 text-muted-foreground/50 mt-1 flex-shrink-0" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
