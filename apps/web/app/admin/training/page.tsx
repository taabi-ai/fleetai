'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Plus, Pencil, Trash2, GraduationCap, Film, Eye, CheckCircle2, ExternalLink, ChevronDown, ChevronRight, Image as ImageIcon, Link2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { PageHeader, Panel, Field, readErr } from '../_components/ui-bits'
import { MediaPicker } from '@/components/media-picker'
import { fmtDuration, type UploadedAsset } from '@/lib/upload-client'

type Chapter = { title: string; startSec: number }
type VideoAsset = { id: string; title: string; fileName: string; durationSec: number | null; size: number }
type Lesson = {
  id: string; moduleId: string; title: string; description: string | null; order: number
  videoAssetId: string | null; videoUrl: string | null; durationSec: number | null
  chapters: Chapter[] | null; notes: string | null; videoAsset: VideoAsset | null; views: number; completions: number
}
type Module = {
  id: string; slug: string; title: string; description: string | null; audience: string; level: string; order: number
  isPublished: boolean; coverAssetId: string | null; coverAsset: { id: string; title: string; fileName: string } | null
  lessons: Lesson[]; createdAt: string; updatedAt: string
}

const AUD_LABEL: Record<string, string> = { customer: 'Customer', internal: 'Internal', both: 'Internal + customer' }
const AUD_CLASS: Record<string, string> = {
  customer: 'bg-sky-500/15 text-sky-600 dark:text-sky-300 border-sky-500/30',
  internal: 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30',
  both: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30',
}

type ModuleForm = { title: string; slug: string; description: string; audience: string; level: string; order: number; isPublished: boolean; coverAssetId: string | null; coverTitle: string | null }
const emptyModule = (): ModuleForm => ({ title: '', slug: '', description: '', audience: 'customer', level: 'beginner', order: 0, isPublished: false, coverAssetId: null, coverTitle: null })

type LessonForm = { title: string; description: string; order: number; source: 'asset' | 'url'; videoAssetId: string | null; videoTitle: string | null; videoUrl: string; durationSec: string; chapters: Chapter[]; notes: string }
const emptyLesson = (order: number): LessonForm => ({ title: '', description: '', order, source: 'asset', videoAssetId: null, videoTitle: null, videoUrl: '', durationSec: '', chapters: [], notes: '' })

export default function AdminTrainingPage() {
  const [modules, setModules] = useState<Module[]>([])
  const [audiences, setAudiences] = useState<string[]>(['customer', 'internal', 'both'])
  const [levels, setLevels] = useState<string[]>(['beginner', 'intermediate', 'advanced'])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)

  // module dialog
  const [modOpen, setModOpen] = useState(false)
  const [modId, setModId] = useState<string | null>(null)
  const [mod, setMod] = useState<ModuleForm>(emptyModule())
  const [coverPick, setCoverPick] = useState(false)
  const [delMod, setDelMod] = useState<Module | null>(null)

  // lesson dialog
  const [lesOpen, setLesOpen] = useState(false)
  const [lesModule, setLesModule] = useState<Module | null>(null)
  const [lesId, setLesId] = useState<string | null>(null)
  const [les, setLes] = useState<LessonForm>(emptyLesson(0))
  const [videoPick, setVideoPick] = useState(false)
  const [delLes, setDelLes] = useState<Lesson | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/training')
    if (res.ok) {
      const d = await res.json()
      setModules(d.modules); setAudiences(d.audiences); setLevels(d.levels)
    } else toast.error(await readErr(res, 'Could not load training modules'))
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const openCreateModule = () => { setModId(null); setMod({ ...emptyModule(), order: modules.length }); setModOpen(true) }
  const openEditModule = (m: Module) => {
    setModId(m.id)
    setMod({ title: m.title, slug: m.slug, description: m.description ?? '', audience: m.audience, level: m.level, order: m.order, isPublished: m.isPublished, coverAssetId: m.coverAssetId, coverTitle: m.coverAsset?.title ?? null })
    setModOpen(true)
  }

  const saveModule = async () => {
    if (!mod.title.trim()) { toast.error('Title is required'); return }
    setSaving(true)
    const payload = { title: mod.title, slug: mod.slug || undefined, description: mod.description, audience: mod.audience, level: mod.level, order: mod.order, isPublished: mod.isPublished, coverAssetId: mod.coverAssetId }
    const res = modId
      ? await fetch(`/api/admin/training/${modId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      : await fetch('/api/admin/training', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setSaving(false)
    if (!res.ok) { toast.error(await readErr(res, 'Could not save module')); return }
    toast.success(modId ? 'Module updated' : 'Module created')
    setModOpen(false); load()
  }

  const togglePublish = async (m: Module, isPublished: boolean) => {
    setModules((ms) => ms.map((x) => (x.id === m.id ? { ...x, isPublished } : x)))
    const res = await fetch(`/api/admin/training/${m.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isPublished }) })
    if (!res.ok) { toast.error(await readErr(res, 'Could not update module')); load() }
    else toast.success(isPublished ? 'Module published' : 'Module unpublished')
  }

  const deleteModule = async () => {
    if (!delMod) return
    setSaving(true)
    const res = await fetch(`/api/admin/training/${delMod.id}`, { method: 'DELETE' })
    setSaving(false)
    if (!res.ok) { toast.error(await readErr(res, 'Could not delete module')); return }
    toast.success('Module deleted'); setDelMod(null); load()
  }

  const openCreateLesson = (m: Module) => { setLesModule(m); setLesId(null); setLes(emptyLesson(m.lessons.length)); setLesOpen(true) }
  const openEditLesson = (m: Module, l: Lesson) => {
    setLesModule(m); setLesId(l.id)
    setLes({
      title: l.title, description: l.description ?? '', order: l.order,
      source: l.videoAssetId ? 'asset' : 'url', videoAssetId: l.videoAssetId, videoTitle: l.videoAsset?.title ?? null,
      videoUrl: l.videoUrl ?? '', durationSec: l.durationSec != null ? String(l.durationSec) : '',
      chapters: Array.isArray(l.chapters) ? l.chapters : [], notes: l.notes ?? '',
    })
    setLesOpen(true)
  }

  const saveLesson = async () => {
    if (!lesModule) return
    if (!les.title.trim()) { toast.error('Lesson title is required'); return }
    setSaving(true)
    const payload = {
      title: les.title, description: les.description, order: les.order, notes: les.notes,
      videoAssetId: les.source === 'asset' ? les.videoAssetId : null,
      videoUrl: les.source === 'url' ? les.videoUrl : null,
      durationSec: les.durationSec.trim() ? Number(les.durationSec) : null,
      chapters: les.chapters.filter((c) => c.title.trim()),
    }
    const res = lesId
      ? await fetch(`/api/admin/training/lessons/${lesId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      : await fetch(`/api/admin/training/${lesModule.id}/lessons`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setSaving(false)
    if (!res.ok) { toast.error(await readErr(res, 'Could not save lesson')); return }
    toast.success(lesId ? 'Lesson updated' : 'Lesson added')
    setLesOpen(false); setOpen((o) => ({ ...o, [lesModule.id]: true })); load()
  }

  const deleteLesson = async () => {
    if (!delLes) return
    setSaving(true)
    const res = await fetch(`/api/admin/training/lessons/${delLes.id}`, { method: 'DELETE' })
    setSaving(false)
    if (!res.ok) { toast.error(await readErr(res, 'Could not delete lesson')); return }
    toast.success('Lesson deleted'); setDelLes(null); load()
  }

  const onPickVideo = (a: UploadedAsset) => {
    setLes((f) => ({ ...f, source: 'asset', videoAssetId: a.id, videoTitle: a.title, durationSec: a.durationSec != null ? String(a.durationSec) : f.durationSec }))
    setVideoPick(false)
  }

  const totalLessons = modules.reduce((s, m) => s + m.lessons.length, 0)
  const totalViews = modules.reduce((s, m) => s + m.lessons.reduce((a, l) => a + l.views, 0), 0)
  const totalCompletions = modules.reduce((s, m) => s + m.lessons.reduce((a, l) => a + l.completions, 0), 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Training modules"
        description="Manage internal and customer training. Lessons play recorded product walkthroughs or externally hosted videos with chapters and notes."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm"><Link href="/training"><ExternalLink className="h-4 w-4 mr-1.5" />Open training center</Link></Button>
            <Button size="sm" onClick={openCreateModule}><Plus className="h-4 w-4 mr-1.5" />New module</Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: 'Modules', value: modules.length, icon: GraduationCap },
          { label: 'Lessons', value: totalLessons, icon: Film },
          { label: 'Learners started', value: totalViews, icon: Eye },
          { label: 'Lesson completions', value: totalCompletions, icon: CheckCircle2 },
        ].map((s) => (
          <Panel key={s.label} className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</p>
              <s.icon className="h-4 w-4 text-primary" />
            </div>
            <p className="mt-2 text-2xl font-semibold font-mono">{s.value}</p>
          </Panel>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading…</div>
      ) : modules.length === 0 ? (
        <Panel className="p-10 text-center">
          <GraduationCap className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="mt-3 font-medium">No training modules yet</p>
          <p className="text-sm text-muted-foreground">Create a module, then add lessons with videos from the media library.</p>
          <Button className="mt-4" onClick={openCreateModule}><Plus className="h-4 w-4 mr-1.5" />New module</Button>
        </Panel>
      ) : (
        <div className="space-y-3">
          {modules.map((m) => {
            const expanded = open[m.id] ?? false
            const dur = m.lessons.reduce((s, l) => s + (l.durationSec ?? 0), 0)
            return (
              <Panel key={m.id} className="p-0 overflow-hidden">
                <div className="flex flex-wrap items-center gap-3 p-4">
                  <button type="button" onClick={() => setOpen((o) => ({ ...o, [m.id]: !expanded }))} className="p-1 rounded hover:bg-muted" aria-label={expanded ? 'Collapse' : 'Expand'}>
                    {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium truncate">{m.title}</p>
                      <Badge variant="outline" className={AUD_CLASS[m.audience] ?? ''}>{AUD_LABEL[m.audience] ?? m.audience}</Badge>
                      <Badge variant="secondary" className="capitalize">{m.level}</Badge>
                      {!m.isPublished && <Badge variant="outline" className="text-muted-foreground">Draft</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">/training/{m.slug} · {m.lessons.length} lesson{m.lessons.length === 1 ? '' : 's'}{dur ? ` · ${fmtDuration(dur)}` : ''}{m.coverAsset ? ` · cover: ${m.coverAsset.title}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Published</span>
                      <Switch checked={m.isPublished} onCheckedChange={(v) => togglePublish(m, v)} />
                    </label>
                    <Button variant="outline" size="sm" onClick={() => openCreateLesson(m)}><Plus className="h-4 w-4 mr-1" />Lesson</Button>
                    <Button variant="ghost" size="icon" onClick={() => openEditModule(m)} aria-label="Edit module"><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDelMod(m)} aria-label="Delete module"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                {expanded && (
                  <div className="border-t border-border bg-muted/30">
                    {m.lessons.length === 0 ? (
                      <p className="p-4 text-sm text-muted-foreground">No lessons yet. Add a lesson and pick a video from the media library or paste an external URL.</p>
                    ) : (
                      <ul className="divide-y divide-border">
                        {m.lessons.map((l, i) => (
                          <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                            <span className="h-7 w-7 rounded-full bg-primary/10 text-primary text-xs font-mono flex items-center justify-center">{i + 1}</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{l.title}</p>
                              <p className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
                                {l.videoAsset ? <><Film className="h-3 w-3" />{l.videoAsset.title}</> : l.videoUrl ? <><Link2 className="h-3 w-3" />{l.videoUrl}</> : <span className="text-amber-500">No video</span>}
                                {l.durationSec ? <span>· {fmtDuration(l.durationSec)}</span> : null}
                                {Array.isArray(l.chapters) && l.chapters.length > 0 ? <span>· {l.chapters.length} chapters</span> : null}
                              </p>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{l.views}</span>
                              <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />{l.completions}</span>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => openEditLesson(m, l)} aria-label="Edit lesson"><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDelLes(l)} aria-label="Delete lesson"><Trash2 className="h-4 w-4" /></Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </Panel>
            )
          })}
        </div>
      )}

      {/* Module dialog */}
      <Dialog open={modOpen} onOpenChange={setModOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{modId ? 'Edit module' : 'New training module'}</DialogTitle>
            <DialogDescription>Modules group lessons for an audience. Only published modules are visible in the training center.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Title"><Input value={mod.title} onChange={(e) => setMod({ ...mod, title: e.target.value })} placeholder="Getting started with dashboards" /></Field>
            <Field label="Slug" hint="Leave blank to generate from the title"><Input value={mod.slug} onChange={(e) => setMod({ ...mod, slug: e.target.value })} placeholder="getting-started" /></Field>
            <Field label="Description"><Textarea rows={3} value={mod.description} onChange={(e) => setMod({ ...mod, description: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Audience">
                <Select value={mod.audience} onValueChange={(v) => setMod({ ...mod, audience: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{audiences.map((a) => <SelectItem key={a} value={a}>{AUD_LABEL[a] ?? a}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Level">
                <Select value={mod.level} onValueChange={(v) => setMod({ ...mod, level: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{levels.map((l) => <SelectItem key={l} value={l} className="capitalize">{l}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Order"><Input type="number" value={mod.order} onChange={(e) => setMod({ ...mod, order: Number(e.target.value) || 0 })} /></Field>
              <Field label="Published"><div className="h-10 flex items-center"><Switch checked={mod.isPublished} onCheckedChange={(v) => setMod({ ...mod, isPublished: v })} /></div></Field>
            </div>
            <Field label="Cover image" hint="Optional — pick an image from the media library">
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setCoverPick(true)}><ImageIcon className="h-4 w-4 mr-1.5" />{mod.coverAssetId ? 'Change' : 'Select image'}</Button>
                {mod.coverAssetId && (
                  <span className="text-sm text-muted-foreground flex items-center gap-1 truncate">{mod.coverTitle ?? mod.coverAssetId}
                    <button type="button" onClick={() => setMod({ ...mod, coverAssetId: null, coverTitle: null })} className="p-0.5 rounded hover:bg-muted" aria-label="Remove cover"><X className="h-3.5 w-3.5" /></button>
                  </span>
                )}
              </div>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModOpen(false)}>Cancel</Button>
            <Button onClick={saveModule} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}{modId ? 'Save changes' : 'Create module'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MediaPicker open={coverPick} onOpenChange={setCoverPick} kind="image" folder="training" title="Select cover image" onSelect={(a) => { setMod((f) => ({ ...f, coverAssetId: a.id, coverTitle: a.title })); setCoverPick(false) }} />

      {/* Lesson dialog */}
      <Dialog open={lesOpen} onOpenChange={setLesOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{lesId ? 'Edit lesson' : `Add lesson to “${lesModule?.title ?? ''}”`}</DialogTitle>
            <DialogDescription>Attach a recorded walkthrough from the media library or an external video URL (MP4/WebM/HLS).</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-[1fr_120px] gap-4">
              <Field label="Title"><Input value={les.title} onChange={(e) => setLes({ ...les, title: e.target.value })} placeholder="Creating your first widget" /></Field>
              <Field label="Order"><Input type="number" value={les.order} onChange={(e) => setLes({ ...les, order: Number(e.target.value) || 0 })} /></Field>
            </div>
            <Field label="Description"><Textarea rows={2} value={les.description} onChange={(e) => setLes({ ...les, description: e.target.value })} /></Field>
            <Field label="Video source">
              <div className="flex gap-2">
                <Button type="button" size="sm" variant={les.source === 'asset' ? 'default' : 'outline'} onClick={() => setLes({ ...les, source: 'asset' })}><Film className="h-4 w-4 mr-1.5" />Media library</Button>
                <Button type="button" size="sm" variant={les.source === 'url' ? 'default' : 'outline'} onClick={() => setLes({ ...les, source: 'url' })}><Link2 className="h-4 w-4 mr-1.5" />External URL</Button>
              </div>
            </Field>
            {les.source === 'asset' ? (
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setVideoPick(true)}>{les.videoAssetId ? 'Change video' : 'Select video'}</Button>
                <span className="text-sm text-muted-foreground truncate">{les.videoTitle ?? (les.videoAssetId ? les.videoAssetId : 'No video selected')}</span>
              </div>
            ) : (
              <Input value={les.videoUrl} onChange={(e) => setLes({ ...les, videoUrl: e.target.value })} placeholder="https://cdn.example.com/videos/intro.mp4" />
            )}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Duration (seconds)" hint="Filled automatically from library videos"><Input type="number" value={les.durationSec} onChange={(e) => setLes({ ...les, durationSec: e.target.value })} /></Field>
            </div>
            <Field label="Chapters" hint="Chapter markers shown on the player timeline">
              <div className="space-y-2">
                {les.chapters.map((c, i) => (
                  <div key={i} className="grid grid-cols-[1fr_110px_36px] gap-2">
                    <Input value={c.title} placeholder="Chapter title" onChange={(e) => setLes({ ...les, chapters: les.chapters.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                    <Input type="number" value={c.startSec} placeholder="sec" onChange={(e) => setLes({ ...les, chapters: les.chapters.map((x, j) => (j === i ? { ...x, startSec: Number(e.target.value) || 0 } : x)) })} />
                    <Button type="button" variant="ghost" size="icon" onClick={() => setLes({ ...les, chapters: les.chapters.filter((_, j) => j !== i) })} aria-label="Remove chapter"><X className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setLes({ ...les, chapters: [...les.chapters, { title: '', startSec: les.chapters.length ? (les.chapters[les.chapters.length - 1].startSec + 30) : 0 }] })}><Plus className="h-4 w-4 mr-1" />Add chapter</Button>
              </div>
            </Field>
            <Field label="Lesson notes" hint="Shown beneath the player (plain text)"><Textarea rows={4} value={les.notes} onChange={(e) => setLes({ ...les, notes: e.target.value })} /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLesOpen(false)}>Cancel</Button>
            <Button onClick={saveLesson} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}{lesId ? 'Save lesson' : 'Add lesson'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MediaPicker open={videoPick} onOpenChange={setVideoPick} kind="video" folder="training" title="Select lesson video" onSelect={onPickVideo} />

      {/* Delete confirmations */}
      <Dialog open={!!delMod} onOpenChange={(o) => !o && setDelMod(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete module?</DialogTitle>
            <DialogDescription>“{delMod?.title}” and its {delMod?.lessons.length ?? 0} lesson(s) and learner progress will be removed. Videos stay in the media library.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelMod(null)}>Cancel</Button>
            <Button variant="destructive" onClick={deleteModule} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!delLes} onOpenChange={(o) => !o && setDelLes(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete lesson?</DialogTitle>
            <DialogDescription>“{delLes?.title}” and its learner progress will be removed.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelLes(null)}>Cancel</Button>
            <Button variant="destructive" onClick={deleteLesson} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
