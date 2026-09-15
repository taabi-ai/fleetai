'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Loader2, UploadCloud, Trash2, Download, ExternalLink, Search, Database, CheckCircle2, XCircle, RefreshCw, Film, Image as ImageIcon, FileText, Music, File, Globe, Lock, Pencil, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { SafeDate } from '@/components/safe-format'
import { PageHeader, Panel, Field, readErr } from '../_components/ui-bits'
import { uploadFile, openAsset, fmtBytes, fmtDuration, type UploadedAsset } from '@/lib/upload-client'

const KIND_ICON: Record<string, typeof Film> = { video: Film, image: ImageIcon, document: FileText, audio: Music, other: File }

type Asset = UploadedAsset & { uploadedBy: { id: string; name: string | null; email: string } | null }
type Backend = { kind: 'custom' | 'platform'; label: string; endpoint: string | null; region: string; bucket: string; prefix: string; forcePathStyle: boolean; publicBaseUrl: string | null }
type Summary = { kind: string; count: number; bytes: number }

type QueueItem = { name: string; pct: number; error?: string }

export default function MediaPage() {
  const [items, setItems] = useState<Asset[]>([])
  const [byKind, setByKind] = useState<Summary[]>([])
  const [backend, setBackend] = useState<Backend | null>(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('all')
  const [folder, setFolder] = useState('media')
  const [isPublic, setIsPublic] = useState(false)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [testing, setTesting] = useState(false)
  const [test, setTest] = useState<{ ok: boolean; message: string; ms: number } | null>(null)
  const [del, setDel] = useState<Asset | null>(null)
  const [edit, setEdit] = useState<Asset | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams({ take: '200' })
    if (kind !== 'all') p.set('kind', kind)
    if (q.trim()) p.set('q', q.trim())
    const res = await fetch(`/api/media?${p}`)
    if (res.ok) {
      const d = await res.json()
      setItems(d.items); setByKind(d.byKind); setBackend(d.backend)
    } else toast.error(await readErr(res, 'Could not load media'))
    setLoading(false)
  }, [kind, q])
  useEffect(() => { load() }, [load])

  const totalBytes = useMemo(() => byKind.reduce((s, k) => s + k.bytes, 0), [byKind])
  const totalCount = useMemo(() => byKind.reduce((s, k) => s + k.count, 0), [byKind])

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files)
    if (!list.length) return
    for (const f of list) {
      setQueue(qq => [...qq, { name: f.name, pct: 0 }])
      try {
        await uploadFile(f, { folder, isPublic, onProgress: pct => setQueue(qq => qq.map(x => x.name === f.name ? { ...x, pct } : x)) })
        setQueue(qq => qq.filter(x => x.name !== f.name))
        toast.success(`Uploaded ${f.name}`)
      } catch (e) {
        setQueue(qq => qq.map(x => x.name === f.name ? { ...x, error: (e as Error).message } : x))
        toast.error((e as Error).message)
      }
    }
    load()
  }

  async function runTest() {
    setTesting(true); setTest(null)
    const res = await fetch('/api/admin/storage', { method: 'POST' })
    const d = await res.json().catch(() => null)
    if (d) { setTest({ ok: d.ok, message: d.message, ms: d.ms }); if (d.backend) setBackend(d.backend) }
    else setTest({ ok: false, message: 'Test failed', ms: 0 })
    setTesting(false)
  }

  async function remove() {
    if (!del) return
    setSaving(true)
    const res = await fetch(`/api/media/${del.id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Deleted'); setDel(null); load() } else toast.error(await readErr(res, 'Delete failed'))
    setSaving(false)
  }

  async function saveTitle() {
    if (!edit) return
    setSaving(true)
    const res = await fetch(`/api/media/${edit.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: editTitle }) })
    if (res.ok) { toast.success('Saved'); setEdit(null); load() } else toast.error(await readErr(res, 'Save failed'))
    setSaving(false)
  }

  async function copyLink(a: Asset) {
    const res = await fetch(`/api/media/${a.id}`)
    if (!res.ok) return toast.error('Could not resolve URL')
    const { url } = await res.json()
    await navigator.clipboard.writeText(url)
    toast.success(a.isPublic ? 'Public URL copied' : 'Signed URL copied (valid 1 hour)')
  }

  return (
    <div>
      <PageHeader
        title="Media & documents"
        description="Videos, documents and images live in S3-compatible object storage (MinIO, AWS S3, Backblaze B2, Cloudflare R2 …). Only the object key and visibility are stored in the database, so switching providers is a bucket copy plus a configuration change."
        actions={<Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />Refresh</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-3 mb-5">
        <Panel className="p-4 lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Database className="h-5 w-5" /></span>
              <div>
                <p className="text-sm font-semibold text-foreground">{backend?.label ?? 'Resolving storage backend…'}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {backend?.kind === 'custom' ? 'Custom S3-compatible backend configured through environment variables.' : 'Platform-managed bucket (default). Set the S3_* variables to point at MinIO, S3 or Backblaze B2.'}
                </p>
                {backend && (
                  <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 text-[11px]">
                    <div><dt className="text-muted-foreground">Bucket</dt><dd className="font-mono text-foreground truncate">{backend.bucket || '—'}</dd></div>
                    <div><dt className="text-muted-foreground">Region</dt><dd className="font-mono text-foreground">{backend.region}</dd></div>
                    <div><dt className="text-muted-foreground">Endpoint</dt><dd className="font-mono text-foreground truncate" title={backend.endpoint ?? ''}>{backend.endpoint ? backend.endpoint.replace(/^https?:\/\//, '') : 'AWS default'}</dd></div>
                    <div><dt className="text-muted-foreground">Prefix</dt><dd className="font-mono text-foreground truncate">{backend.prefix || '(root)'}</dd></div>
                  </dl>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              <Button size="sm" variant="outline" onClick={runTest} disabled={testing}>
                {testing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}Test connection
              </Button>
              <Link href="/admin/env" className="text-[11px] text-primary hover:underline">Configure S3_* variables →</Link>
            </div>
          </div>
          {test && (
            <div className={`mt-3 flex items-center gap-2 rounded-md px-3 py-2 text-xs ${test.ok ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' : 'bg-destructive/10 text-destructive'}`}>
              {test.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
              <span>{test.message}</span><span className="ml-auto font-mono opacity-70">{test.ms} ms</span>
            </div>
          )}
        </Panel>
        <Panel className="p-4">
          <p className="text-xs text-muted-foreground">Library</p>
          <p className="font-mono text-2xl font-semibold text-foreground mt-1">{totalCount} <span className="text-sm text-muted-foreground font-sans">assets · {fmtBytes(totalBytes)}</span></p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {byKind.map(k => {
              const Icon = KIND_ICON[k.kind] ?? File
              return <Badge key={k.kind} variant="outline" className="text-[10px] gap-1 capitalize"><Icon className="h-3 w-3" />{k.kind} {k.count}</Badge>
            })}
            {byKind.length === 0 && <span className="text-[11px] text-muted-foreground">Nothing uploaded yet.</span>}
          </div>
        </Panel>
      </div>

      <Panel className="p-4 mb-5">
        <div className="flex flex-col md:flex-row md:items-end gap-3 mb-3">
          <Field label="Folder" hint="Groups objects under uploads/<folder>/">
            <Input value={folder} onChange={e => setFolder(e.target.value.replace(/[^a-z0-9_-]/gi, '').toLowerCase())} className="h-9 w-44 font-mono text-xs" />
          </Field>
          <div className="flex items-center gap-2 pb-2">
            <Switch id="pub" checked={isPublic} onCheckedChange={setIsPublic} />
            <label htmlFor="pub" className="text-xs text-foreground flex items-center gap-1">{isPublic ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}{isPublic ? 'Public (permanent URL)' : 'Private (signed URLs)'}</label>
          </div>
        </div>
        <div
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files) }}
          onClick={() => fileRef.current?.click()}
          className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${drag ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
        >
          <input ref={fileRef} type="file" multiple className="hidden" onChange={e => { if (e.target.files) handleFiles(e.target.files); e.target.value = '' }} />
          <UploadCloud className="h-7 w-7 mx-auto text-primary" />
          <p className="text-sm font-medium text-foreground mt-2">Drop files here or click to browse</p>
          <p className="text-[11px] text-muted-foreground mt-1">Videos, PDFs, images, spreadsheets … up to 5 GB. Files over 100 MB are uploaded in parts.</p>
        </div>
        {queue.length > 0 && (
          <div className="mt-3 space-y-2">
            {queue.map(qi => (
              <div key={qi.name} className="text-xs">
                <div className="flex justify-between mb-1"><span className="truncate text-foreground">{qi.name}</span><span className={qi.error ? 'text-destructive' : 'text-muted-foreground'}>{qi.error ? 'Failed' : `${qi.pct}%`}</span></div>
                {qi.error ? <p className="text-[11px] text-destructive">{qi.error}</p> : <Progress value={qi.pct} className="h-1.5" />}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel>
        <div className="flex flex-col sm:flex-row gap-2 p-3 border-b border-border">
          <div className="relative flex-1">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search title or file name" className="pl-8 h-9" />
          </div>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All kinds</SelectItem>
              {['video', 'image', 'document', 'audio', 'other'].map(k => <SelectItem key={k} value={k} className="capitalize">{k}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Visibility</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
              ) : items.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-10 text-sm text-muted-foreground">No assets match.</TableCell></TableRow>
              ) : items.map(a => {
                const Icon = KIND_ICON[a.kind] ?? File
                return (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center flex-shrink-0"><Icon className="h-4 w-4" /></span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate max-w-[280px]">{a.title}</p>
                          <p className="text-[11px] text-muted-foreground font-mono truncate max-w-[280px]" title={a.cloud_storage_path}>{a.cloud_storage_path}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px] capitalize">{a.kind}</Badge>{a.durationSec ? <span className="ml-1.5 text-[11px] font-mono text-muted-foreground">{fmtDuration(a.durationSec)}</span> : null}</TableCell>
                    <TableCell className="font-mono text-xs">{fmtBytes(a.size)}</TableCell>
                    <TableCell>{a.isPublic ? <Badge className="text-[10px] gap-1 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-0"><Globe className="h-3 w-3" />Public</Badge> : <Badge variant="secondary" className="text-[10px] gap-1"><Lock className="h-3 w-3" />Private</Badge>}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <SafeDate date={a.createdAt} options={{ dateStyle: 'medium' }} />
                      {a.uploadedBy && <p className="text-[11px] truncate max-w-[160px]">{a.uploadedBy.name ?? a.uploadedBy.email}</p>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-0.5">
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Open" onClick={() => openAsset(a.id).catch(e => toast.error(e.message))}><ExternalLink className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Download" onClick={() => openAsset(a.id, true).catch(e => toast.error(e.message))}><Download className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Copy link" onClick={() => copyLink(a)}><Copy className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Rename" onClick={() => { setEdit(a); setEditTitle(a.title) }}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Delete" onClick={() => setDel(a)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </Panel>

      <Dialog open={!!edit} onOpenChange={o => !o && setEdit(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Rename asset</DialogTitle><DialogDescription>Display title shown in the library and training modules.</DialogDescription></DialogHeader>
          <Field label="Title"><Input value={editTitle} onChange={e => setEditTitle(e.target.value)} /></Field>
          <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={saveTitle} disabled={saving || !editTitle.trim()}>{saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!del} onOpenChange={o => !o && setDel(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Delete asset?</DialogTitle><DialogDescription>“{del?.title}” will be removed from object storage and from the library. Assets used by training lessons cannot be deleted until detached.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDel(null)}>Cancel</Button><Button variant="destructive" onClick={remove} disabled={saving}>{saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}Delete</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
