'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams, useRouter } from 'next/navigation'
import { WidgetRenderer } from './widget-renderer'
import { FloatingAssistant } from './floating-assistant'
import { WidgetEditChat } from './widget-edit-chat'
import type { FocusedWidget } from './ai-assistant'
import type { LockState } from './widget-wrapper'
import { AppNav } from '@/components/app-nav'
import { PinSettingsDialog } from '@/components/pin-settings-dialog'
import { WidgetSettingsDialog } from './widget-settings-dialog'
import { ShareDialog } from './share-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Plus, Trash2, LayoutDashboard, Sparkles, ChevronDown, Save, Globe, GlobeLock,
  Pencil, Check, Loader2, Users, Library, Share2,
} from 'lucide-react'
import { toast } from 'sonner'

import { ResponsiveGridLayout as Responsive, useContainerWidth } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'

type LayoutItem = {
  i: string
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
  static?: boolean
}

type WidgetData = {
  id: string
  widgetConfig: any
  gridPos: any
  lockedById?: string | null
  lockedAt?: string | null
  lockedBy?: { id: string; name?: string | null; email?: string | null } | null
}

type DashboardData = {
  id: string
  name: string
  description?: string | null
  userId: string
  isPublished: boolean
  publishedAt?: string | null
  cloneCount?: number
  widgets: WidgetData[]
  user?: { id: string; name?: string | null; email?: string | null }
}

const PRESETS = [
  { key: 'fleet_overview', label: 'Fleet Operations Overview', icon: '🚛' },
  { key: 'safety_adas', label: 'Safety & ADAS Report', icon: '🛡️' },
  { key: 'ev_monitor', label: 'EV Fleet Monitor', icon: '⚡' },
]

async function readError(res: Response, fallback: string) {
  const data = await res.json().catch(() => ({}))
  return (data?.error as string) ?? fallback
}

export function DashboardGrid() {
  const { data: session } = useSession() || {}
  const userId = session?.user?.id
  const searchParams = useSearchParams()
  const router = useRouter()
  const requestedId = searchParams?.get('dashboard') ?? null

  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [myDashboards, setMyDashboards] = useState<DashboardData[]>([])
  const [loadingDashboard, setLoadingDashboard] = useState(true)
  const [aiOpen, setAiOpen] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [focusedWidget, setFocusedWidget] = useState<FocusedWidget | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [publishing, setPublishing] = useState(false)

  // Dialog states
  const [newDashOpen, setNewDashOpen] = useState(false)
  const [newDashName, setNewDashName] = useState('')
  const [newDashDesc, setNewDashDesc] = useState('')
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameName, setRenameName] = useState('')
  const [renameDesc, setRenameDesc] = useState('')
  const [publishWidgetTarget, setPublishWidgetTarget] = useState<WidgetData | null>(null)
  const [publishWidgetDesc, setPublishWidgetDesc] = useState('')
  const [settingsTarget, setSettingsTarget] = useState<WidgetData | null>(null)
  const [shareOpen, setShareOpen] = useState(false)

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const pendingPositionsRef = useRef<WidgetData[] | null>(null)

  const isOwner = !!dashboard && !!userId && dashboard.userId === userId

  const refreshMyDashboards = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard')
      if (!res.ok) return []
      const list = await res.json()
      if (Array.isArray(list)) {
        setMyDashboards(list)
        return list as DashboardData[]
      }
    } catch { /* silent */ }
    return []
  }, [])

  // Load dashboard (from ?dashboard=, else first own, else create)
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoadingDashboard(true)
      try {
        const list = await refreshMyDashboards()
        if (requestedId) {
          const res = await fetch(`/api/dashboard/${requestedId}`)
          if (res.ok) {
            const d = await res.json()
            if (!cancelled) setDashboard(d)
            return
          }
          toast.error('Dashboard not found or not accessible')
        }
        if (list.length > 0) {
          if (!cancelled) setDashboard(list[0])
        } else {
          const createRes = await fetch('/api/dashboard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'My Dashboard' }),
          })
          if (createRes.ok) {
            const newDash = await createRes.json()
            if (!cancelled) {
              setDashboard(newDash)
              setMyDashboards([newDash])
            }
          }
        }
      } catch {
        toast.error('Failed to load dashboard')
      } finally {
        if (!cancelled) setLoadingDashboard(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [requestedId, refreshMyDashboards])

  // Poll lock state periodically when dashboard is shared (published) so collaborators see locks
  useEffect(() => {
    if (!dashboard?.id || !dashboard.isPublished) return
    const id = dashboard.id
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/dashboard/${id}`)
        if (!res.ok) return
        const fresh: DashboardData = await res.json()
        setDashboard(prev => {
          if (!prev || prev.id !== fresh.id) return prev
          const lockMap = new Map(fresh.widgets.map(w => [w.id, w]))
          return {
            ...prev,
            isPublished: fresh.isPublished,
            widgets: prev.widgets.map(w => {
              const f = lockMap.get(w.id)
              return f ? { ...w, lockedById: f.lockedById, lockedAt: f.lockedAt, lockedBy: f.lockedBy } : w
            }),
          }
        })
      } catch { /* silent */ }
    }, 8000)
    return () => clearInterval(timer)
  }, [dashboard?.id, dashboard?.isPublished])

  const flushPositions = useCallback(async (showToast = false) => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null }
    const widgets = pendingPositionsRef.current
    if (!dashboard?.id) return
    setSaving(true)
    try {
      if (widgets) {
        const res = await fetch(`/api/dashboard/${dashboard.id}/widgets`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ widgets: widgets.map(w => ({ id: w.id, gridPos: w.gridPos })) }),
        })
        if (!res.ok) throw new Error(await readError(res, 'Save failed'))
        pendingPositionsRef.current = null
      } else {
        // Nothing pending — touch dashboard to bump updatedAt
        await fetch(`/api/dashboard/${dashboard.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }).catch(() => {})
      }
      setDirty(false)
      if (showToast) toast.success('Dashboard saved')
    } catch (e: any) {
      if (showToast) toast.error(e?.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [dashboard?.id])

  // Save widget positions (debounced)
  const savePositions = useCallback((widgets: WidgetData[]) => {
    if (!dashboard?.id) return
    pendingPositionsRef.current = widgets
    setDirty(true)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => { flushPositions(false) }, 300)
  }, [dashboard?.id, flushPositions])

  const handleLayoutChange = useCallback((layout: LayoutItem[]) => {
    setDashboard(prev => {
      if (!prev) return prev
      let changed = false
      const widgets = (prev.widgets ?? []).map(w => {
        const l = (layout ?? []).find((li: LayoutItem) => li?.i === w.id)
        if (l) {
          const gp = w.gridPos ?? {}
          if (gp.x !== l.x || gp.y !== l.y || gp.w !== l.w || gp.h !== l.h) changed = true
          return { ...w, gridPos: { x: l.x, y: l.y, w: l.w, h: l.h } }
        }
        return w
      })
      if (!changed) return prev
      const updated = { ...prev, widgets }
      savePositions(updated.widgets)
      return updated
    })
  }, [savePositions])

  const handleWidgetCreate = useCallback(async (config: any) => {
    if (!dashboard?.id) return
    const gridPos = config?.gridPos ?? { x: 0, y: 0, w: 6, h: 4 }
    try {
      const res = await fetch(`/api/dashboard/${dashboard.id}/widgets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ widgetConfig: config, gridPos }),
      })
      if (res.ok) {
        const widget = await res.json()
        setDashboard(prev => prev ? { ...prev, widgets: [...(prev.widgets ?? []), widget] } : prev)
        toast.success(`Widget "${config?.title ?? 'New'}" created!`)
      } else {
        toast.error(await readError(res, 'Failed to save widget'))
      }
    } catch {
      toast.error('Failed to save widget')
    }
  }, [dashboard?.id])

  const handleWidgetUpdate = useCallback(async (widgetId: string, config: any): Promise<boolean> => {
    if (!dashboard?.id) return false
    try {
      const res = await fetch(`/api/dashboard/${dashboard.id}/widgets/${widgetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ widgetConfig: config }),
      })
      if (res.status === 423) {
        toast.error('This widget is locked by another user')
        return false
      }
      if (!res.ok) {
        toast.error(await readError(res, 'Failed to update widget'))
        return false
      }
      const updated = await res.json()
      setDashboard(prev => prev ? {
        ...prev,
        widgets: (prev.widgets ?? []).map(w => w.id === widgetId ? { ...w, widgetConfig: updated?.widgetConfig ?? config } : w),
      } : prev)
      setFocusedWidget(prev => prev && prev.id === widgetId ? { ...prev, title: config?.title ?? prev.title, widgetConfig: config } : prev)
      toast.success('Widget updated')
      return true
    } catch {
      toast.error('Failed to update widget')
      return false
    }
  }, [dashboard?.id])

  const handleDeleteWidget = useCallback(async (widgetId: string) => {
    if (!dashboard?.id) return
    try {
      const res = await fetch(`/api/dashboard/${dashboard.id}/widgets/${widgetId}`, { method: 'DELETE' })
      if (res.status === 423) { toast.error('Widget is locked by another user'); return }
      if (!res.ok) { toast.error(await readError(res, 'Failed to delete widget')); return }
      setDashboard(prev => prev ? { ...prev, widgets: (prev.widgets ?? []).filter(w => w.id !== widgetId) } : prev)
      setFocusedWidget(prev => prev?.id === widgetId ? null : prev)
      toast.success('Widget removed')
    } catch {
      toast.error('Failed to delete widget')
    }
  }, [dashboard?.id])

  const handleDuplicateWidget = useCallback(async (widget: WidgetData) => {
    if (!dashboard?.id) return
    const newPos = { ...((widget?.gridPos as any) ?? {}), x: 0, y: 10000 }
    try {
      const res = await fetch(`/api/dashboard/${dashboard.id}/widgets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ widgetConfig: widget.widgetConfig, gridPos: newPos }),
      })
      if (res.ok) {
        const newWidget = await res.json()
        setDashboard(prev => prev ? { ...prev, widgets: [...(prev.widgets ?? []), newWidget] } : prev)
        toast.success('Widget duplicated')
      } else {
        toast.error(await readError(res, 'Failed to duplicate widget'))
      }
    } catch {
      toast.error('Failed to duplicate widget')
    }
  }, [dashboard?.id])

  const handleTitleChange = useCallback(async (widgetId: string, title: string) => {
    const widget = (dashboard?.widgets ?? []).find(w => w.id === widgetId)
    if (!widget) return
    await handleWidgetUpdate(widgetId, { ...(widget.widgetConfig ?? {}), title })
  }, [dashboard?.widgets, handleWidgetUpdate])

  const handleToggleLock = useCallback(async (widget: WidgetData) => {
    if (!dashboard?.id) return
    const lockedByMe = !!widget.lockedById && widget.lockedById === userId
    const method = widget.lockedById ? 'DELETE' : 'POST'
    try {
      const res = await fetch(`/api/dashboard/${dashboard.id}/widgets/${widget.id}/lock`, { method })
      if (res.status === 423) { toast.error('Widget is already locked by another user'); return }
      if (!res.ok) { toast.error(await readError(res, 'Lock operation failed')); return }
      const updated = await res.json()
      setDashboard(prev => prev ? {
        ...prev,
        widgets: (prev.widgets ?? []).map(w => w.id === widget.id
          ? { ...w, lockedById: updated?.lockedById ?? null, lockedAt: updated?.lockedAt ?? null, lockedBy: updated?.lockedBy ?? null }
          : w),
      } : prev)
      if (method === 'POST') toast.success('Widget locked — only you can edit it now')
      else toast.success(lockedByMe ? 'Widget unlocked' : 'Lock removed (owner override)')
    } catch {
      toast.error('Lock operation failed')
    }
  }, [dashboard?.id, userId])

  const submitPublishWidget = useCallback(async () => {
    const widget = publishWidgetTarget
    if (!widget) return
    try {
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: widget.widgetConfig?.title ?? 'Untitled widget',
          description: publishWidgetDesc || undefined,
          widgetConfig: widget.widgetConfig,
          gridPos: widget.gridPos,
        }),
      })
      if (!res.ok) { toast.error(await readError(res, 'Failed to publish widget')); return }
      toast.success('Widget published to the library', {
        action: { label: 'Open library', onClick: () => router.push('/library') },
      })
      setPublishWidgetTarget(null)
      setPublishWidgetDesc('')
    } catch {
      toast.error('Failed to publish widget')
    }
  }, [publishWidgetTarget, publishWidgetDesc, router])

  const handleClearDashboard = useCallback(async () => {
    if (!dashboard?.id) return
    const widgets = dashboard.widgets ?? []
    let skipped = 0
    for (const w of widgets) {
      const res = await fetch(`/api/dashboard/${dashboard.id}/widgets/${w.id}`, { method: 'DELETE' }).catch(() => null)
      if (!res || !res.ok) skipped++
    }
    setDashboard(prev => prev ? {
      ...prev,
      widgets: skipped ? prev.widgets.filter(w => w.lockedById && w.lockedById !== userId) : [],
    } : prev)
    setFocusedWidget(null)
    if (skipped) toast.warning(`Dashboard cleared — ${skipped} locked widget(s) kept`)
    else toast.success('Dashboard cleared')
  }, [dashboard, userId])

  const handleLoadPreset = useCallback(async (preset: string) => {
    try {
      const res = await fetch('/api/dashboard/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset }),
      })
      if (res.ok) {
        const newDash = await res.json()
        setDashboard(newDash)
        setFocusedWidget(null)
        refreshMyDashboards()
        toast.success(`Loaded preset: ${newDash?.name ?? preset}`)
      }
    } catch {
      toast.error('Failed to load preset')
    }
  }, [refreshMyDashboards])

  const switchDashboard = useCallback((id: string) => {
    if (id === dashboard?.id) return
    setFocusedWidget(null)
    router.push(`/dashboard?dashboard=${id}`)
  }, [dashboard?.id, router])

  const createDashboard = useCallback(async () => {
    const name = newDashName.trim()
    if (!name) return
    try {
      const res = await fetch('/api/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: newDashDesc.trim() || undefined }),
      })
      if (!res.ok) { toast.error(await readError(res, 'Failed to create dashboard')); return }
      const d = await res.json()
      setNewDashOpen(false)
      setNewDashName('')
      setNewDashDesc('')
      await refreshMyDashboards()
      setDashboard(d)
      setFocusedWidget(null)
      router.push(`/dashboard?dashboard=${d.id}`)
      toast.success(`Dashboard "${d.name}" created`)
    } catch {
      toast.error('Failed to create dashboard')
    }
  }, [newDashName, newDashDesc, refreshMyDashboards, router])

  const patchDashboard = useCallback(async (body: Record<string, any>) => {
    if (!dashboard?.id) return null
    const res = await fetch(`/api/dashboard/${dashboard.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(await readError(res, 'Update failed'))
    return res.json()
  }, [dashboard?.id])

  const submitRename = useCallback(async () => {
    const name = renameName.trim()
    if (!name) return
    try {
      const d = await patchDashboard({ name, description: renameDesc.trim() || null })
      setDashboard(prev => prev ? { ...prev, name: d?.name ?? name, description: d?.description ?? renameDesc } : prev)
      setRenameOpen(false)
      refreshMyDashboards()
      toast.success('Dashboard updated')
    } catch (e: any) {
      toast.error(e?.message ?? 'Update failed')
    }
  }, [renameName, renameDesc, patchDashboard, refreshMyDashboards])

  const handleTogglePublish = useCallback(async () => {
    if (!dashboard) return
    setPublishing(true)
    try {
      await flushPositions(false)
      const next = !dashboard.isPublished
      const d = await patchDashboard({ isPublished: next })
      setDashboard(prev => prev ? { ...prev, isPublished: d?.isPublished ?? next, publishedAt: d?.publishedAt ?? prev.publishedAt } : prev)
      refreshMyDashboards()
      if (next) {
        toast.success('Dashboard published to the marketplace', {
          action: { label: 'View marketplace', onClick: () => router.push('/marketplace') },
        })
      } else {
        toast.success('Dashboard unpublished — it is private again')
      }
    } catch (e: any) {
      toast.error(e?.message ?? 'Publish failed')
    } finally {
      setPublishing(false)
    }
  }, [dashboard, patchDashboard, flushPositions, refreshMyDashboards, router])

  const handleDeleteDashboard = useCallback(async () => {
    if (!dashboard?.id || !isOwner) return
    if (!window.confirm(`Delete dashboard "${dashboard.name}" and all its widgets?`)) return
    try {
      const res = await fetch(`/api/dashboard/${dashboard.id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error(await readError(res, 'Delete failed')); return }
      toast.success('Dashboard deleted')
      setDashboard(null)
      router.push('/dashboard')
    } catch {
      toast.error('Delete failed')
    }
  }, [dashboard, isOwner, router])

  const { width: containerWidth, containerRef: gridContainerRef } = useContainerWidth({ initialWidth: 1200 })

  const widgets = dashboard?.widgets ?? []

  const lockFor = useCallback((w: WidgetData): LockState => {
    const lockedByMe = !!w.lockedById && w.lockedById === userId
    const lockedByOther = !!w.lockedById && w.lockedById !== userId
    return {
      lockedByMe,
      lockedByOther,
      lockedByName: w.lockedBy?.name ?? w.lockedBy?.email ?? undefined,
      canOverride: lockedByOther && isOwner,
    }
  }, [userId, isOwner])

  const layout: LayoutItem[] = useMemo(() => widgets.map(w => ({
    i: w.id,
    x: (w.gridPos as any)?.x ?? 0,
    y: (w.gridPos as any)?.y ?? 0,
    w: (w.gridPos as any)?.w ?? 6,
    h: (w.gridPos as any)?.h ?? 4,
    minW: 2,
    minH: 2,
    static: !!w.lockedById && w.lockedById !== userId,
  })), [widgets, userId])

  const openEditWithAI = useCallback((w: WidgetData) => {
    // Opens a dedicated edit chat anchored near the widget (independent of the
    // main AI assistant docked in the corner).
    setFocusedWidget({ id: w.id, title: w.widgetConfig?.title ?? 'Widget', widgetConfig: w.widgetConfig })
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <AppNav onOpenPinSettings={() => setPinOpen(true)}>
        {/* Dashboard switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="text-xs gap-1 border-white/10 max-w-[220px]" data-testid="dashboard-switcher" title="Switch dashboard">
              <LayoutDashboard className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="truncate">{dashboard?.name ?? 'Dashboard'}</span>
              <ChevronDown className="w-3 h-3 shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[240px]">
            <DropdownMenuLabel className="text-xs text-muted-foreground">My dashboards</DropdownMenuLabel>
            {myDashboards.map(d => (
              <DropdownMenuItem key={d.id} onClick={() => switchDashboard(d.id)} className="text-xs gap-2">
                {d.id === dashboard?.id ? <Check className="w-3 h-3 text-primary" /> : <span className="w-3" />}
                <span className="truncate flex-1">{d.name}</span>
                {d.isPublished && <Globe className="w-3 h-3 text-emerald-400" />}
              </DropdownMenuItem>
            ))}
            {dashboard && !isOwner && (
              <DropdownMenuItem className="text-xs gap-2 opacity-80" disabled>
                <Users className="w-3 h-3" /> Shared: {dashboard.name}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setNewDashOpen(true)} className="text-xs gap-2">
              <Plus className="w-3 h-3" /> New dashboard
            </DropdownMenuItem>
            {isOwner && (
              <DropdownMenuItem
                onClick={() => { setRenameName(dashboard!.name); setRenameDesc(dashboard!.description ?? ''); setRenameOpen(true) }}
                className="text-xs gap-2"
              >
                <Pencil className="w-3 h-3" /> Rename / describe
              </DropdownMenuItem>
            )}
            {isOwner && myDashboards.length > 1 && (
              <DropdownMenuItem onClick={handleDeleteDashboard} className="text-xs gap-2 text-destructive focus:text-destructive">
                <Trash2 className="w-3 h-3" /> Delete dashboard
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Presets */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="text-xs gap-1 border-white/10 hidden sm:inline-flex">
              <Sparkles className="w-3 h-3" /> Presets <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[220px]">
            {PRESETS.map(p => (
              <DropdownMenuItem key={p.key} onClick={() => handleLoadPreset(p.key)} className="text-xs gap-2">
                <span>{p.icon}</span> {p.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex items-center gap-2 ml-auto">
          {dashboard?.isPublished && (
            <span className="hidden md:inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">
              <Globe className="w-3 h-3" /> Published{!isOwner && dashboard.user ? ` · by ${dashboard.user.name ?? dashboard.user.email ?? 'owner'}` : ''}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => flushPositions(true)}
            disabled={saving || !dashboard}
            className="text-xs gap-1 border-white/10"
            title="Save dashboard layout"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            <span className="hidden sm:inline">{dirty ? 'Save*' : 'Save'}</span>
          </Button>
          {isOwner && (
            <Button variant="outline" size="sm" onClick={() => setShareOpen(true)} className="text-xs gap-1 border-white/10" title="Share with specific users">
              <Share2 className="w-3 h-3" />
              <span className="hidden sm:inline">Share</span>
            </Button>
          )}
          {isOwner && (
            <Button
              size="sm"
              onClick={handleTogglePublish}
              disabled={publishing || !dashboard}
              variant={dashboard?.isPublished ? 'outline' : 'default'}
              className={`text-xs gap-1 ${dashboard?.isPublished ? 'border-white/10' : ''}`}
            >
              {publishing ? <Loader2 className="w-3 h-3 animate-spin" /> : dashboard?.isPublished ? <GlobeLock className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
              <span className="hidden sm:inline">{dashboard?.isPublished ? 'Unpublish' : 'Publish'}</span>
            </Button>
          )}
          {isOwner && (
            <Button variant="ghost" size="sm" onClick={handleClearDashboard} className="text-xs gap-1 text-destructive hover:text-destructive hidden lg:inline-flex">
              <Trash2 className="w-3 h-3" /> Clear
            </Button>
          )}
        </div>
      </AppNav>

      {/* Grid Content */}
      <div className="p-4" ref={gridContainerRef}>
        {dashboard?.description && (
          <p className="text-xs text-muted-foreground mb-3 px-1 max-w-3xl">{dashboard.description}</p>
        )}
        {loadingDashboard ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <span className="text-sm text-muted-foreground">Loading dashboard...</span>
            </div>
          </div>
        ) : !dashboard ? (
          <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">No dashboard selected.</div>
        ) : widgets.length === 0 ? (
          <div className="flex items-center justify-center h-[60vh]">
            <div className="text-center space-y-4 max-w-md">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <LayoutDashboard className="w-8 h-8 text-primary" />
              </div>
              <h2 className="font-display text-xl font-semibold text-foreground">Your Dashboard is Empty</h2>
              <p className="text-sm text-muted-foreground">
                Click the sparkle button in the bottom-right corner and describe what you want to visualize,
                add widgets from the library, or load a preset to get started.
              </p>
              <div className="flex gap-2 justify-center flex-wrap">
                {PRESETS.map(p => (
                  <Button key={p.key} variant="outline" size="sm" onClick={() => handleLoadPreset(p.key)} className="text-xs gap-1 border-white/10">
                    <span>{p.icon}</span> {p.label}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2 justify-center">
                <Button onClick={() => setAiOpen(true)} className="mt-2 gap-2">
                  <Sparkles className="w-4 h-4" /> Ask the AI
                </Button>
                <Button variant="outline" onClick={() => router.push('/library')} className="mt-2 gap-2 border-white/10">
                  <Library className="w-4 h-4" /> Widget library
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <Responsive
            className="layout"
            width={containerWidth || 800}
            layouts={{ lg: layout }}
            breakpoints={{ lg: 1200, md: 996, sm: 768 }}
            cols={{ lg: 12, md: 10, sm: 6 }}
            rowHeight={60}
            onLayoutChange={(newLayout: any) => handleLayoutChange(newLayout)}
            {...({ isResizable: true, isDraggable: true, compactType: 'vertical', margin: [12, 12], draggableCancel: '.widget-no-drag' } as any)}
          >
            {widgets.map(w => (
              <div key={w.id} data-widget-id={w.id}>
                <WidgetRenderer
                  widget={w}
                  onDelete={() => handleDeleteWidget(w.id)}
                  onDuplicate={() => handleDuplicateWidget(w)}
                  onTitleChange={(title) => handleTitleChange(w.id, title)}
                  onEditWithAI={() => openEditWithAI(w)}
                  onToggleLock={() => handleToggleLock(w)}
                  onPublish={() => { setPublishWidgetTarget(w); setPublishWidgetDesc('') }}
                  onSettings={() => setSettingsTarget(w)}
                  lock={lockFor(w)}
                  focused={focusedWidget?.id === w.id}
                />
              </div>
            ))}
          </Responsive>
        )}
      </div>

      {/* Floating AI assistant */}
      <FloatingAssistant
        open={aiOpen}
        onOpenChange={setAiOpen}
        onWidgetCreate={handleWidgetCreate}
        onWidgetUpdate={handleWidgetUpdate}
        focusedWidget={null}
        onClearFocus={() => {}}
        onOpenPinSettings={() => setPinOpen(true)}
      />

      {/* Dedicated widget edit chat — floats near the widget being edited */}
      {focusedWidget && (
        <WidgetEditChat
          focusedWidget={focusedWidget}
          onWidgetCreate={handleWidgetCreate}
          onWidgetUpdate={handleWidgetUpdate}
          onClose={() => setFocusedWidget(null)}
        />
      )}

      <PinSettingsDialog open={pinOpen} onOpenChange={setPinOpen} />

      <WidgetSettingsDialog
        open={!!settingsTarget}
        onOpenChange={(o) => { if (!o) setSettingsTarget(null) }}
        config={settingsTarget?.widgetConfig ?? {}}
        onSave={async (cfg) => {
          if (!settingsTarget) return false
          const ok = await handleWidgetUpdate(settingsTarget.id, cfg)
          if (ok) toast.success('Widget settings saved')
          return ok
        }}
      />

      {dashboard && isOwner && (
        <ShareDialog open={shareOpen} onOpenChange={setShareOpen} dashboardId={dashboard.id} dashboardName={dashboard.name} />
      )}

      {/* New dashboard dialog */}
      <Dialog open={newDashOpen} onOpenChange={setNewDashOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New dashboard</DialogTitle>
            <DialogDescription>Create an empty dashboard and start adding widgets.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="nd-name">Name</Label>
              <Input id="nd-name" value={newDashName} onChange={e => setNewDashName(e.target.value)} placeholder="e.g. Customer demo — Acme Logistics" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nd-desc">Description (optional)</Label>
              <Textarea id="nd-desc" value={newDashDesc} onChange={e => setNewDashDesc(e.target.value)} placeholder="What is this dashboard for?" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewDashOpen(false)}>Cancel</Button>
            <Button onClick={createDashboard} disabled={!newDashName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Dashboard details</DialogTitle>
            <DialogDescription>The description is shown in the marketplace when published.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="rn-name">Name</Label>
              <Input id="rn-name" value={renameName} onChange={e => setRenameName(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rn-desc">Description</Label>
              <Textarea id="rn-desc" value={renameDesc} onChange={e => setRenameDesc(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button onClick={submitRename} disabled={!renameName.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Publish widget dialog */}
      <Dialog open={!!publishWidgetTarget} onOpenChange={(o) => { if (!o) setPublishWidgetTarget(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Publish widget to library</DialogTitle>
            <DialogDescription>
              A snapshot of &quot;{publishWidgetTarget?.widgetConfig?.title ?? 'this widget'}&quot; will be shared with all users, who can add it to their own dashboards.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="pw-desc">Description (optional)</Label>
            <Textarea id="pw-desc" value={publishWidgetDesc} onChange={e => setPublishWidgetDesc(e.target.value)} placeholder="Describe what this widget shows and when to use it" rows={3} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPublishWidgetTarget(null)}>Cancel</Button>
            <Button onClick={submitPublishWidget} className="gap-1"><Library className="w-3.5 h-3.5" /> Publish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
