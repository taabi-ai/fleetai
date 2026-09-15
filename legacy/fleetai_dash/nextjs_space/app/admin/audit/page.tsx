'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { Loader2, Search, Download, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SafeDate } from '@/components/safe-format'
import { PageHeader, Panel } from '../_components/ui-bits'

type Row = {
  id: string; actorEmail?: string | null; actorRole?: string | null; action: string; entity: string; entityId?: string | null
  summary: string; method?: string | null; path?: string | null; status?: number | null; ip?: string | null; userAgent?: string | null
  payload?: unknown; result?: unknown; durationMs?: number | null; createdAt: string
}
type Resp = { items: Row[]; total: number; page: number; pageSize: number; actions: string[]; entities: string[]; stats: { last24h: number; errors24h: number; all: number } }

const ALL = '__all__'

function verbColor(action: string) {
  const v = action.split('.').pop() ?? ''
  if (/create|signup|grant|approve|publish|login$/.test(v)) return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30'
  if (/delete|remove|reject|blocked|failed|revoke/.test(v)) return 'bg-red-500/15 text-red-600 dark:text-red-300 border-red-500/30'
  if (/update|patch|edit|layout|lock|unlock|set|toggle/.test(v)) return 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30'
  return 'bg-primary/10 text-primary border-primary/30'
}

export default function AuditPage() {
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [actor, setActor] = useState('')
  const [action, setAction] = useState(ALL)
  const [entity, setEntity] = useState(ALL)
  const [status, setStatus] = useState(ALL)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<string | null>(null)

  const buildQuery = useCallback((extra: Record<string, string> = {}) => {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (actor) p.set('actor', actor)
    if (action !== ALL) p.set('action', action)
    if (entity !== ALL) p.set('entity', entity)
    if (status !== ALL) p.set('status', status)
    if (from) p.set('from', new Date(from).toISOString())
    if (to) p.set('to', new Date(to + 'T23:59:59').toISOString())
    p.set('page', String(page))
    Object.entries(extra).forEach(([k, v]) => p.set(k, v))
    return p.toString()
  }, [q, actor, action, entity, status, from, to, page])

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/audit?${buildQuery()}`)
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [buildQuery])

  useEffect(() => { load() }, [load])

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const reset = () => { setQ(''); setActor(''); setAction(ALL); setEntity(ALL); setStatus(ALL); setFrom(''); setTo(''); setPage(1) }

  return (
    <div>
      <PageHeader
        title="Audit logs"
        description="Every mutating request on the platform is recorded here — sign-ins, widget edits (including layout moves), dashboard changes, admin configuration, AI usage and more. Secret values are redacted before storage."
        actions={
          <>
            <Button size="sm" variant="outline" onClick={load}><RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh</Button>
            <Button size="sm" variant="outline" onClick={() => { const a = document.createElement('a'); a.href = `/api/admin/audit?${buildQuery({ format: 'csv' })}`; a.download = 'audit-log.csv'; a.click() }}>
              <Download className="w-3.5 h-3.5 mr-1.5" /> Export CSV
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: 'Events (24h)', value: data?.stats.last24h },
          { label: 'Errors (24h)', value: data?.stats.errors24h, tone: (data?.stats.errors24h ?? 0) > 0 ? 'text-red-500' : '' },
          { label: 'Total events', value: data?.stats.all },
        ].map(s => (
          <Panel key={s.label} className="p-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{s.label}</div>
            <div className={`font-mono text-2xl font-semibold mt-1 ${s.tone ?? ''}`}>{s.value ?? '—'}</div>
          </Panel>
        ))}
      </div>

      <Panel className="p-3 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          <div className="relative col-span-2">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input className="pl-8 h-8 text-xs" placeholder="Search summary, path, id…" value={q} onChange={e => { setQ(e.target.value); setPage(1) }} />
          </div>
          <Input className="h-8 text-xs" placeholder="Actor email" value={actor} onChange={e => { setActor(e.target.value); setPage(1) }} />
          <Select value={action} onValueChange={v => { setAction(v); setPage(1) }}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Action" /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={ALL}>All actions</SelectItem>
              {(data?.actions ?? []).map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={entity} onValueChange={v => { setEntity(v); setPage(1) }}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Entity" /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={ALL}>All entities</SelectItem>
              {(data?.entities ?? []).map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={v => { setStatus(v); setPage(1) }}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any status</SelectItem>
              <SelectItem value="ok">Success (2xx/3xx)</SelectItem>
              <SelectItem value="error">Failed (4xx/5xx)</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-1">
            <Input type="date" className="h-8 text-xs" value={from} onChange={e => { setFrom(e.target.value); setPage(1) }} />
            <Input type="date" className="h-8 text-xs" value={to} onChange={e => { setTo(e.target.value); setPage(1) }} />
          </div>
        </div>
        <div className="flex justify-end mt-2"><Button size="sm" variant="ghost" className="h-7 text-xs" onClick={reset}>Clear filters</Button></div>
      </Panel>

      <Panel>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[150px]">Time</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Summary</TableHead>
              <TableHead className="w-[70px]">Status</TableHead>
              <TableHead className="w-[70px] text-right">ms</TableHead>
              <TableHead className="w-[40px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !data && (
              <TableRow><TableCell colSpan={7} className="text-center py-10"><Loader2 className="w-4 h-4 animate-spin inline" /></TableCell></TableRow>
            )}
            {data && data.items.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-xs text-muted-foreground">No audit events match these filters.</TableCell></TableRow>
            )}
            {data?.items.map(r => {
              const open = expanded === r.id
              const ok = (r.status ?? 200) < 400
              return (
                <Fragment key={r.id}>
                  <TableRow className="cursor-pointer" onClick={() => setExpanded(open ? null : r.id)}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      <SafeDate date={r.createdAt} options={{ dateStyle: 'medium', timeStyle: 'medium' }} />
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="truncate max-w-[180px]">{r.actorEmail ?? <span className="text-muted-foreground">anonymous</span>}</div>
                      {r.actorRole && <div className="text-[10px] text-muted-foreground">{r.actorRole}</div>}
                    </TableCell>
                    <TableCell><Badge variant="outline" className={`text-[10px] font-mono ${verbColor(r.action)}`}>{r.action}</Badge></TableCell>
                    <TableCell className="text-xs max-w-[360px] truncate" title={r.summary}>{r.summary}</TableCell>
                    <TableCell><span className={`font-mono text-xs ${ok ? 'text-emerald-500' : 'text-red-500'}`}>{r.status ?? '—'}</span></TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">{r.durationMs ?? '—'}</TableCell>
                    <TableCell>{open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</TableCell>
                  </TableRow>
                  {open && (
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell colSpan={7}>
                        <div className="grid md:grid-cols-2 gap-3 text-xs py-1">
                          <div className="space-y-1">
                            <div><span className="text-muted-foreground">Request:</span> <span className="font-mono">{r.method} {r.path}</span></div>
                            <div><span className="text-muted-foreground">Entity:</span> {r.entity}{r.entityId ? <span className="font-mono"> · {r.entityId}</span> : null}</div>
                            <div><span className="text-muted-foreground">IP:</span> {r.ip ?? '—'}</div>
                            <div className="truncate" title={r.userAgent ?? ''}><span className="text-muted-foreground">Agent:</span> {r.userAgent ?? '—'}</div>
                          </div>
                          <div className="space-y-2">
                            <div>
                              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Payload</div>
                              <pre className="font-mono text-[11px] bg-background/60 border border-border rounded-md p-2 max-h-48 overflow-auto">{r.payload === undefined || r.payload === null ? '—' : JSON.stringify(r.payload, null, 2)}</pre>
                            </div>
                            <div>
                              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Result</div>
                              <pre className="font-mono text-[11px] bg-background/60 border border-border rounded-md p-2 max-h-48 overflow-auto">{r.result === undefined || r.result === null ? '—' : JSON.stringify(r.result, null, 2)}</pre>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between px-3 py-2 border-t border-border text-xs text-muted-foreground">
          <span>{data ? `${data.total} events · page ${data.page} of ${pages}` : ''}</span>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" className="h-7" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-3.5 h-3.5" /></Button>
            <Button size="sm" variant="ghost" className="h-7" disabled={page >= pages} onClick={() => setPage(p => p + 1)}><ChevronRight className="w-3.5 h-3.5" /></Button>
          </div>
        </div>
      </Panel>
    </div>
  )
}
