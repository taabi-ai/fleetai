'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { AppNav } from '@/components/app-nav'
import { PinSettingsDialog } from '@/components/pin-settings-dialog'
import { VideoPlayer, type PlayerChapter } from '@/components/video-player'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ArrowLeft, CheckCircle2, Circle, PlayCircle, ChevronLeft, ChevronRight, Loader2, ListOrdered, FileText } from 'lucide-react'
import { fmtDuration } from '@/lib/upload-client'
import { toast } from 'sonner'

type Lesson = {
  id: string; title: string; description: string | null; order: number; durationSec: number | null; chapters: PlayerChapter[]; notes: string | null
  videoUrl: string | null; contentType: string | null; positionSec: number; completed: boolean
}
type Data = { module: { id: string; slug: string; title: string; description: string | null; audience: string; level: string }; lessons: Lesson[] }

export function ModulePlayer({ slug }: { slug: string }) {
  const router = useRouter()
  const search = useSearchParams()
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [current, setCurrent] = useState<string | null>(null)
  const [pinOpen, setPinOpen] = useState(false)

  useEffect(() => {
    fetch(`/api/training/${slug}`).then(async r => {
      if (!r.ok) { setErr(r.status === 404 ? 'This module is not available to you or does not exist.' : 'Could not load module'); return }
      const d: Data = await r.json()
      setData(d)
      const wanted = search.get('lesson')
      const first = d.lessons.find(l => l.id === wanted) ?? d.lessons.find(l => !l.completed) ?? d.lessons[0]
      setCurrent(first?.id ?? null)
    })
  }, [slug, search])

  const lesson = useMemo(() => data?.lessons.find(l => l.id === current) ?? null, [data, current])
  const idx = data && lesson ? data.lessons.indexOf(lesson) : -1
  const completedCount = data?.lessons.filter(l => l.completed).length ?? 0

  const saveProgress = useCallback((lessonId: string, positionSec: number, completed: boolean) => {
    fetch('/api/training/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lessonId, positionSec, completed }) }).catch(() => {})
    setData(d => d ? { ...d, lessons: d.lessons.map(l => l.id === lessonId ? { ...l, positionSec, completed: l.completed || completed } : l) } : d)
  }, [])

  const go = (id: string) => {
    setCurrent(id)
    router.replace(`/training/${slug}?lesson=${id}`, { scroll: false })
  }

  const markComplete = () => {
    if (!lesson) return
    saveProgress(lesson.id, lesson.durationSec ?? lesson.positionSec, true)
    toast.success('Lesson marked as completed')
  }

  return (
    <div className="min-h-screen bg-background">
      <AppNav onOpenPinSettings={() => setPinOpen(true)} />
      <PinSettingsDialog open={pinOpen} onOpenChange={setPinOpen} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm"><Link href="/training"><ArrowLeft className="h-4 w-4 mr-1" />All modules</Link></Button>
          {data && (
            <div className="min-w-0">
              <h1 className="font-display text-lg font-semibold text-foreground truncate">{data.module.title}</h1>
              <p className="text-[11px] text-muted-foreground">{completedCount}/{data.lessons.length} lessons completed</p>
            </div>
          )}
        </div>

        {err ? (
          <div className="rounded-xl border border-border p-12 text-center text-sm text-muted-foreground">{err}</div>
        ) : !data || !lesson ? (
          <div className="py-24 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
            <div className="space-y-4 min-w-0">
              <VideoPlayer
                key={lesson.id}
                src={lesson.videoUrl}
                contentType={lesson.contentType}
                title={lesson.title}
                chapters={lesson.chapters}
                startAt={lesson.completed ? 0 : lesson.positionSec}
                onProgress={(pos, _dur, done) => saveProgress(lesson.id, pos, done)}
                onEnded={() => { const next = data.lessons[idx + 1]; if (next) setTimeout(() => go(next.id), 1200) }}
                className="shadow-2xl"
              />
              <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm p-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-primary font-medium">Lesson {idx + 1} of {data.lessons.length}</p>
                    <h2 className="font-display text-xl font-semibold text-foreground mt-0.5">{lesson.title}</h2>
                    {lesson.description && <p className="text-sm text-muted-foreground mt-2 max-w-2xl">{lesson.description}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {lesson.completed ? (
                      <Badge className="border-0 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 gap-1"><CheckCircle2 className="h-3.5 w-3.5" />Completed</Badge>
                    ) : (
                      <Button size="sm" variant="outline" onClick={markComplete}><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Mark complete</Button>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between mt-5 pt-4 border-t border-border">
                  <Button variant="ghost" size="sm" disabled={idx <= 0} onClick={() => go(data.lessons[idx - 1].id)}><ChevronLeft className="h-4 w-4 mr-1" />Previous</Button>
                  <Button size="sm" disabled={idx >= data.lessons.length - 1} onClick={() => go(data.lessons[idx + 1].id)}>Next lesson<ChevronRight className="h-4 w-4 ml-1" /></Button>
                </div>
              </div>
              {lesson.notes && (
                <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm p-5">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-foreground mb-2"><FileText className="h-3.5 w-3.5 text-primary" />Lesson notes</p>
                  <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{lesson.notes}</div>
                </div>
              )}
            </div>

            <aside className="space-y-4">
              <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm overflow-hidden">
                <div className="p-4 border-b border-border">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-foreground"><ListOrdered className="h-3.5 w-3.5 text-primary" />Course content</p>
                  <Progress value={data.lessons.length ? (completedCount / data.lessons.length) * 100 : 0} className="h-1.5 mt-3" />
                </div>
                <ol className="divide-y divide-border max-h-[60vh] overflow-y-auto">
                  {data.lessons.map((l, i) => {
                    const active = l.id === lesson.id
                    const pct = l.durationSec && !l.completed ? Math.min(100, Math.round((l.positionSec / l.durationSec) * 100)) : l.completed ? 100 : 0
                    return (
                      <li key={l.id}>
                        <button type="button" onClick={() => go(l.id)} className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${active ? 'bg-primary/10' : 'hover:bg-muted/60'}`}>
                          <span className="mt-0.5 flex-shrink-0">{l.completed ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : active ? <PlayCircle className="h-4 w-4 text-primary" /> : <Circle className="h-4 w-4 text-muted-foreground/60" />}</span>
                          <span className="min-w-0 flex-1">
                            <span className={`block text-sm truncate ${active ? 'text-foreground font-medium' : 'text-foreground/90'}`}>{i + 1}. {l.title}</span>
                            <span className="block text-[11px] text-muted-foreground font-mono mt-0.5">{fmtDuration(l.durationSec)}{pct > 0 && pct < 100 ? ` · ${pct}% watched` : ''}</span>
                            {pct > 0 && pct < 100 && <Progress value={pct} className="h-1 mt-1.5" />}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ol>
              </div>
              {lesson.chapters.length > 0 && (
                <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm p-4">
                  <p className="text-xs font-medium text-foreground mb-2">Chapters</p>
                  <ul className="space-y-1">
                    {lesson.chapters.map((c, i) => (
                      <li key={i} className="flex items-center justify-between text-xs text-muted-foreground"><span className="truncate">{c.title}</span><span className="font-mono text-[11px]">{fmtDuration(c.startSec)}</span></li>
                    ))}
                  </ul>
                  <p className="text-[10px] text-muted-foreground mt-2">Use the chapters button in the player to jump.</p>
                </div>
              )}
            </aside>
          </div>
        )}
      </main>
    </div>
  )
}
