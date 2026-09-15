'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { AppNav } from '@/components/app-nav'
import { PinSettingsDialog } from '@/components/pin-settings-dialog'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { GraduationCap, Search, PlayCircle, Clock, CheckCircle2, Users, Building2, Settings2, Film } from 'lucide-react'
import { fmtDuration } from '@/lib/upload-client'

type Mod = {
  id: string; slug: string; title: string; description: string | null; audience: string; level: string
  lessonCount: number; completed: number; totalSec: number; coverUrl: string | null; resumeLessonId: string | null; pct: number
}

const AUD: Record<string, { label: string; icon: typeof Users; cls: string }> = {
  customer: { label: 'Customer', icon: Users, cls: 'bg-sky-500/15 text-sky-600 dark:text-sky-300' },
  internal: { label: 'Internal', icon: Building2, cls: 'bg-violet-500/15 text-violet-600 dark:text-violet-300' },
  both: { label: 'Everyone', icon: GraduationCap, cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' },
}

export function TrainingHome() {
  const [mods, setMods] = useState<Mod[]>([])
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<'all' | 'customer' | 'internal'>('all')
  const [pinOpen, setPinOpen] = useState(false)
  const [broken, setBroken] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetch('/api/training').then(async r => {
      if (r.ok) { const d = await r.json(); setMods(d.modules); setCanManage(d.canManage) }
    }).finally(() => setLoading(false))
  }, [])

  const hasInternal = mods.some(m => m.audience === 'internal')
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return mods.filter(m => (tab === 'all' || (tab === 'internal' ? m.audience === 'internal' : m.audience !== 'internal')) && (!s || m.title.toLowerCase().includes(s) || (m.description ?? '').toLowerCase().includes(s)))
  }, [mods, q, tab])

  const totals = useMemo(() => ({
    lessons: mods.reduce((s, m) => s + m.lessonCount, 0),
    done: mods.reduce((s, m) => s + m.completed, 0),
    sec: mods.reduce((s, m) => s + m.totalSec, 0),
  }), [mods])

  return (
    <div className="min-h-screen bg-background">
      <AppNav onOpenPinSettings={() => setPinOpen(true)} />
      <PinSettingsDialog open={pinOpen} onOpenChange={setPinOpen} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-primary mb-1"><GraduationCap className="w-5 h-5" /><span className="text-xs font-medium uppercase tracking-wider">Training center</span></div>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-foreground">Learn FleetAI Dash</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">Short video walkthroughs recorded from the live platform. Your progress is saved automatically, so you can pick up where you left off.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search modules…" className="pl-8 w-56 bg-card" />
            </div>
            {canManage && <Button asChild variant="outline" size="sm"><Link href="/admin/training"><Settings2 className="h-3.5 w-3.5 mr-1.5" />Manage</Link></Button>}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Stat icon={Film} label="Modules" value={String(mods.length)} sub={`${totals.lessons} lessons`} />
          <Stat icon={Clock} label="Total watch time" value={fmtDuration(totals.sec)} sub="across all modules" />
          <Stat icon={CheckCircle2} label="Completed" value={`${totals.done}/${totals.lessons}`} sub={totals.lessons ? `${Math.round((totals.done / totals.lessons) * 100)}% of lessons` : 'no lessons yet'} />
        </div>

        {hasInternal && (
          <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
            {(['all', 'customer', 'internal'] as const).map(t => (
              <button key={t} type="button" onClick={() => setTab(t)} className={`px-3 py-1.5 text-xs rounded-md capitalize transition-colors ${tab === t ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                {t === 'all' ? 'All' : t === 'customer' ? 'Customer training' : 'Internal training'}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-64 rounded-xl bg-card/60 border border-border animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <GraduationCap className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="mt-3 text-sm font-medium text-foreground">No training modules {q ? 'match your search' : 'published yet'}</p>
            {canManage && !q && <p className="text-xs text-muted-foreground mt-1">Create one in <Link href="/admin/training" className="text-primary hover:underline">Admin → Training</Link>.</p>}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(m => {
              const a = AUD[m.audience] ?? AUD.customer
              const href = m.resumeLessonId ? `/training/${m.slug}?lesson=${m.resumeLessonId}` : `/training/${m.slug}`
              return (
                <Link key={m.id} href={href} className="group rounded-xl border border-border bg-card/80 backdrop-blur-sm overflow-hidden hover:border-primary/50 hover:shadow-lg transition-all flex flex-col">
                  <div className="relative aspect-video bg-muted overflow-hidden">
                    {m.coverUrl && !broken[m.id] ? (
                      <Image src={m.coverUrl} alt={`${m.title} cover`} fill unoptimized className="object-cover group-hover:scale-[1.03] transition-transform" onError={() => setBroken(b => ({ ...b, [m.id]: true }))} />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-primary/10 to-transparent flex items-center justify-center">
                        <PlayCircle className="h-12 w-12 text-primary/80 group-hover:scale-110 transition-transform" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/70 to-transparent flex items-end justify-between">
                      <Badge className={`border-0 text-[10px] gap-1 ${a.cls}`}><a.icon className="h-3 w-3" />{a.label}</Badge>
                      <span className="text-[11px] font-mono text-white/90">{m.lessonCount} lesson{m.lessonCount === 1 ? '' : 's'} · {fmtDuration(m.totalSec)}</span>
                    </div>
                  </div>
                  <div className="p-4 flex-1 flex flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display font-semibold text-foreground leading-snug">{m.title}</h3>
                      <Badge variant="outline" className="text-[10px] capitalize flex-shrink-0">{m.level}</Badge>
                    </div>
                    {m.description && <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{m.description}</p>}
                    <div className="mt-auto pt-4">
                      <div className="flex items-center justify-between text-[11px] mb-1.5">
                        <span className="text-muted-foreground">{m.pct === 100 ? 'Completed' : m.completed > 0 ? `${m.completed}/${m.lessonCount} completed` : 'Not started'}</span>
                        <span className="font-mono text-foreground">{m.pct}%</span>
                      </div>
                      <Progress value={m.pct} className="h-1.5" />
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

function Stat({ icon: Icon, label, value, sub }: { icon: typeof Film; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm p-4 flex items-center gap-3">
      <span className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Icon className="h-5 w-5" /></span>
      <div>
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="font-mono text-lg font-semibold text-foreground leading-tight">{value}</p>
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </div>
    </div>
  )
}
