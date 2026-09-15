'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, Link2, Palette, Database, Settings2, Plus, X } from 'lucide-react'

const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v)

const SCHEMES: { key: string; hex: string }[] = [
  { key: 'blue', hex: '#3B82F6' },
  { key: 'green', hex: '#10B981' },
  { key: 'orange', hex: '#F59E0B' },
  { key: 'purple', hex: '#6366F1' },
  { key: 'red', hex: '#EF4444' },
  { key: 'teal', hex: '#14B8A6' },
]

const DATA_SOURCES: { key: string; label: string; metrics: string[] }[] = [
  { key: 'fleet', label: 'Fleet Management', metrics: ['vehicle_count', 'vehicle_status', 'utilization', 'mileage_trend', 'vehicle_locations', 'vehicle_list', 'alerts', 'maintenance_due'] },
  { key: 'tms', label: 'Transport Management (TMS)', metrics: ['deliveries', 'on_time_rate', 'active_trips', 'trip_list', 'route_efficiency', 'shipment_status'] },
  { key: 'adas', label: 'ADAS / Driver Safety', metrics: ['safety_score', 'events_trend', 'event_types', 'driver_ranking', 'harsh_braking', 'distraction_alerts'] },
  { key: 'fuel', label: 'Fuel Sensing', metrics: ['fuel_level', 'consumption_trend', 'fuel_efficiency', 'theft_alerts', 'refuel_events', 'cost_summary'] },
  { key: 'ev', label: 'EV Monitoring', metrics: ['battery_soc', 'charging_status', 'range_estimate', 'energy_consumption', 'charging_sessions', 'battery_health'] },
  { key: 'weather', label: 'Live Weather', metrics: ['current', 'forecast'] },
]

const WIDGET_TYPES = ['kpi_card', 'line_chart', 'bar_chart', 'area_chart', 'pie_chart', 'gauge', 'table', 'map', 'weather']

type McpServer = { id: string; name: string; url: string; description?: string | null }

export function WidgetSettingsDialog({
  open, onOpenChange, config, onSave,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  config: any
  onSave: (config: any) => Promise<boolean> | boolean
}) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState('kpi_card')
  const [colorScheme, setColorScheme] = useState('blue')
  const [accentColor, setAccentColor] = useState('')
  const [dataSource, setDataSource] = useState('fleet')
  const [metric, setMetric] = useState('')
  const [days, setDays] = useState('')
  const [city, setCity] = useState('')
  const [refreshSec, setRefreshSec] = useState('')
  const [pageSize, setPageSize] = useState('')
  const [colors, setColors] = useState<string[]>([])
  const [mcpServerId, setMcpServerId] = useState('')
  const [mcpLink, setMcpLink] = useState('')
  const [servers, setServers] = useState<McpServer[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitle(config?.title ?? '')
    setType(config?.type ?? 'kpi_card')
    setColorScheme(config?.colorScheme ?? 'blue')
    setAccentColor(config?.accentColor ?? '')
    setDataSource(config?.dataSource ?? 'fleet')
    setMetric(config?.metric ?? '')
    setDays(config?.params?.days ? String(config.params.days) : '')
    setCity(config?.params?.city ?? '')
    setRefreshSec(config?.refreshSec ? String(config.refreshSec) : '')
    setPageSize(config?.pageSize ? String(config.pageSize) : '')
    setColors(Array.isArray(config?.colors) ? config.colors.filter((c: any) => typeof c === 'string' && isHex(c)) : [])
    setMcpServerId(config?.mcpServerId ?? '')
    setMcpLink(config?.mcpLink ?? '')
    fetch('/api/mcp-servers').then(r => r.ok ? r.json() : []).then(d => setServers(Array.isArray(d) ? d : [])).catch(() => setServers([]))
  }, [open, config])

  const metrics = useMemo(() => DATA_SOURCES.find(d => d.key === dataSource)?.metrics ?? [], [dataSource])

  const handleSave = async () => {
    setSaving(true)
    const params: Record<string, any> = { ...(config?.params ?? {}) }
    if (days.trim()) params.days = Number(days) || undefined; else delete params.days
    if (city.trim()) params.city = city.trim(); else delete params.city
    const server = servers.find(s => s.id === mcpServerId)
    const next = {
      ...config,
      title: title.trim() || config?.title || 'Widget',
      type,
      colorScheme,
      accentColor: /^#[0-9a-fA-F]{6}$/.test(accentColor.trim()) ? accentColor.trim() : undefined,
      dataSource,
      metric: metric.trim() || undefined,
      params,
      refreshSec: Number(refreshSec) > 0 ? Number(refreshSec) : undefined,
      pageSize: Number(pageSize) > 0 ? Math.min(100, Math.floor(Number(pageSize))) : undefined,
      colors: colors.filter(isHex).length ? colors.filter(isHex) : undefined,
      mcpServerId: mcpServerId || undefined,
      mcpServerName: server?.name,
      mcpLink: mcpLink.trim() || server?.url || undefined,
    }
    const ok = await onSave(next)
    setSaving(false)
    if (ok) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Settings2 className="w-4 h-4 text-primary" /> Widget settings</DialogTitle>
          <DialogDescription>Configure appearance, data source and MCP links for this widget.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="appearance">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="appearance" className="text-xs gap-1"><Palette className="w-3 h-3" /> Appearance</TabsTrigger>
            <TabsTrigger value="data" className="text-xs gap-1"><Database className="w-3 h-3" /> Data source</TabsTrigger>
            <TabsTrigger value="mcp" className="text-xs gap-1"><Link2 className="w-3 h-3" /> MCP link</TabsTrigger>
          </TabsList>

          <TabsContent value="appearance" className="space-y-4 pt-3">
            <div className="space-y-1.5">
              <Label htmlFor="ws-title">Title</Label>
              <Input id="ws-title" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Widget type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WIDGET_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Color scheme</Label>
              <div className="flex items-center gap-2">
                {SCHEMES.map(s => (
                  <button
                    key={s.key}
                    type="button"
                    title={s.key}
                    onClick={() => { setColorScheme(s.key); setAccentColor('') }}
                    className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${colorScheme === s.key && !accentColor ? 'border-white' : 'border-transparent'}`}
                    style={{ backgroundColor: s.hex }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ws-accent">Custom accent color (hex)</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(accentColor) ? accentColor : '#6366F1'}
                  onChange={e => setAccentColor(e.target.value)}
                  className="w-9 h-9 rounded-md bg-transparent border border-white/10 cursor-pointer"
                />
                <Input id="ws-accent" value={accentColor} onChange={e => setAccentColor(e.target.value)} placeholder="#6366F1 (optional, overrides scheme)" className="font-mono" />
                {accentColor && <Button variant="ghost" size="sm" onClick={() => setAccentColor('')}>Clear</Button>}
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Per-item colors</Label>
                <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setColors(c => [...c, '#3B82F6'])}>
                  <Plus className="w-3 h-3" /> Add color
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">Assigns a color to each item in order (bars, slices or table rows). Overrides the scheme for those items.</p>
              {colors.length === 0 && <p className="text-[11px] text-muted-foreground italic">No per-item colors set.</p>}
              <div className="space-y-2">
                {colors.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground w-5 tabular-nums">{i + 1}</span>
                    <input
                      type="color"
                      value={isHex(c) ? c : '#3B82F6'}
                      onChange={e => setColors(arr => arr.map((x, xi) => xi === i ? e.target.value : x))}
                      className="w-8 h-8 rounded-md bg-transparent border border-white/10 cursor-pointer"
                    />
                    <Input
                      value={c}
                      onChange={e => setColors(arr => arr.map((x, xi) => xi === i ? e.target.value : x))}
                      className="font-mono text-xs h-8"
                      placeholder="#3B82F6"
                    />
                    <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setColors(arr => arr.filter((_, xi) => xi !== i))}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="data" className="space-y-4 pt-3">
            <div className="space-y-1.5">
              <Label>Data source</Label>
              <Select value={dataSource} onValueChange={(v) => { setDataSource(v); setMetric('') }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DATA_SOURCES.map(d => <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ws-metric">Metric</Label>
              <Input id="ws-metric" value={metric} onChange={e => setMetric(e.target.value)} placeholder={metrics[0] ?? 'metric key'} list="ws-metrics" />
              <datalist id="ws-metrics">
                {metrics.map(m => <option key={m} value={m} />)}
              </datalist>
              <div className="flex flex-wrap gap-1 pt-1">
                {metrics.map(m => (
                  <button key={m} type="button" onClick={() => setMetric(m)} className={`px-2 py-0.5 rounded-md text-[10px] border ${metric === m ? 'border-primary text-primary bg-primary/10' : 'border-white/10 text-muted-foreground hover:text-foreground'}`}>{m}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ws-days">Days (time range)</Label>
                <Input id="ws-days" type="number" min={1} value={days} onChange={e => setDays(e.target.value)} placeholder="e.g. 7" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ws-city">City (weather)</Label>
                <Input id="ws-city" value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Mumbai" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ws-refresh">Auto refresh (sec, 0 = off)</Label>
                <Input id="ws-refresh" type="number" min={0} value={refreshSec} onChange={e => setRefreshSec(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ws-pagesize">Rows per page (table)</Label>
                <Input id="ws-pagesize" type="number" min={1} max={100} value={pageSize} onChange={e => setPageSize(e.target.value)} placeholder="8" />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="mcp" className="space-y-4 pt-3">
            <div className="space-y-1.5">
              <Label>MCP server</Label>
              <Select value={mcpServerId || 'none'} onValueChange={(v) => { const id = v === 'none' ? '' : v; setMcpServerId(id); const s = servers.find(x => x.id === id); if (s && !mcpLink) setMcpLink(s.url) }}>
                <SelectTrigger><SelectValue placeholder="Select an MCP server" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {servers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {servers.length === 0 && <p className="text-[11px] text-muted-foreground">No MCP servers defined yet. A super admin can add them in the Admin console.</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ws-link">Link URL</Label>
              <Input id="ws-link" value={mcpLink} onChange={e => setMcpLink(e.target.value)} placeholder="https://… (opens from the widget header)" className="font-mono text-xs" />
              <p className="text-[11px] text-muted-foreground">Defaults to the selected server URL. A link icon appears in the widget header when set.</p>
            </div>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
