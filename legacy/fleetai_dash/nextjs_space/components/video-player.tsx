'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, PictureInPicture2, SkipBack, SkipForward, Settings2, ListOrdered, Check, Loader2, AlertTriangle } from 'lucide-react'
import { fmtDuration } from '@/lib/upload-client'

export type PlayerChapter = { title: string; startSec: number }

type Props = {
  src: string | null
  contentType?: string | null
  poster?: string | null
  title?: string
  chapters?: PlayerChapter[]
  /** Resume position (seconds). */
  startAt?: number
  /** Called every ~5s while playing, on pause/seek and on end. */
  onProgress?: (positionSec: number, durationSec: number, completed: boolean) => void
  onEnded?: () => void
  autoPlay?: boolean
  className?: string
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

/**
 * Custom HTML5 video player: scrubber with buffered ranges + chapter markers, volume, speed, PiP,
 * fullscreen, keyboard shortcuts (space/k, ←/→, j/l, ↑/↓, m, f, 0-9) and resume/progress callbacks.
 */
export function VideoPlayer({ src, contentType, poster, title, chapters = [], startAt = 0, onProgress, onEnded, autoPlay, className = '' }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastReport = useRef(0)

  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState<{ s: number; e: number }[]>([])
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [fs, setFs] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [menu, setMenu] = useState<'none' | 'speed' | 'chapters'>('none')
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hoverPct, setHoverPct] = useState<number | null>(null)
  const [pipSupported, setPipSupported] = useState(false)

  useEffect(() => { setPipSupported(typeof document !== 'undefined' && 'pictureInPictureEnabled' in document) }, [])

  const report = useCallback((force = false, completed = false) => {
    const v = videoRef.current
    if (!v || !onProgress || !Number.isFinite(v.duration)) return
    const now = Date.now()
    if (!force && now - lastReport.current < 5000) return
    lastReport.current = now
    onProgress(Math.floor(v.currentTime), Math.floor(v.duration), completed || v.currentTime / v.duration > 0.95)
  }, [onProgress])

  // Apply resume position once metadata is known.
  const appliedStart = useRef(false)
  useEffect(() => { appliedStart.current = false; setError(null); setTime(0); setDuration(0) }, [src])

  const onLoaded = () => {
    const v = videoRef.current
    if (!v) return
    setDuration(v.duration)
    if (!appliedStart.current && startAt > 0 && startAt < v.duration - 3) { v.currentTime = startAt }
    appliedStart.current = true
  }

  const onTime = () => {
    const v = videoRef.current
    if (!v) return
    setTime(v.currentTime)
    const b: { s: number; e: number }[] = []
    for (let i = 0; i < v.buffered.length; i++) b.push({ s: v.buffered.start(i), e: v.buffered.end(i) })
    setBuffered(b)
    report()
  }

  const toggle = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play().catch(() => {})
    else v.pause()
  }, [])

  const seekTo = useCallback((t: number) => {
    const v = videoRef.current
    if (!v || !Number.isFinite(v.duration)) return
    v.currentTime = Math.min(Math.max(0, t), v.duration)
    setTime(v.currentTime)
    report(true)
  }, [report])

  const seekBy = useCallback((d: number) => { const v = videoRef.current; if (v) seekTo(v.currentTime + d) }, [seekTo])

  const setVol = useCallback((val: number) => {
    const v = videoRef.current
    if (!v) return
    const n = Math.min(1, Math.max(0, val))
    v.volume = n; v.muted = n === 0
    setVolume(n); setMuted(n === 0)
  }, [])

  const toggleMute = useCallback(() => { const v = videoRef.current; if (!v) return; v.muted = !v.muted; setMuted(v.muted) }, [])

  const toggleFs = useCallback(() => {
    const el = wrapRef.current
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else el.requestFullscreen?.().catch(() => {})
  }, [])

  const togglePip = useCallback(async () => {
    const v = videoRef.current as (HTMLVideoElement & { requestPictureInPicture?: () => Promise<unknown> }) | null
    if (!v) return
    try {
      if ((document as any).pictureInPictureElement) await (document as any).exitPictureInPicture()
      else await v.requestPictureInPicture?.()
    } catch { /* unsupported */ }
  }, [])

  useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  useEffect(() => {
    const v = videoRef.current
    if (v) v.playbackRate = speed
  }, [speed, src])

  // Keyboard shortcuts while the player is focused / hovered.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return
      switch (e.key) {
        case ' ': case 'k': e.preventDefault(); toggle(); break
        case 'ArrowLeft': e.preventDefault(); seekBy(-5); break
        case 'ArrowRight': e.preventDefault(); seekBy(5); break
        case 'j': seekBy(-10); break
        case 'l': seekBy(10); break
        case 'ArrowUp': e.preventDefault(); setVol(volume + 0.1); break
        case 'ArrowDown': e.preventDefault(); setVol(volume - 0.1); break
        case 'm': toggleMute(); break
        case 'f': toggleFs(); break
        case 'p': togglePip(); break
        case '>': setSpeed(s => SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(s) + 1)]); break
        case '<': setSpeed(s => SPEEDS[Math.max(0, SPEEDS.indexOf(s) - 1)]); break
        default:
          if (/^[0-9]$/.test(e.key) && duration) seekTo((Number(e.key) / 10) * duration)
      }
    }
    el.addEventListener('keydown', handler)
    return () => el.removeEventListener('keydown', handler)
  }, [toggle, seekBy, setVol, toggleMute, toggleFs, togglePip, volume, duration, seekTo])

  const bumpControls = () => {
    setShowControls(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => { if (videoRef.current && !videoRef.current.paused && menu === 'none') setShowControls(false) }, 2600)
  }

  const pct = duration ? (time / duration) * 100 : 0
  const currentChapter = useMemo(() => [...chapters].reverse().find(c => c.startSec <= time) ?? null, [chapters, time])

  const barSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = barRef.current?.getBoundingClientRect()
    if (!r || !duration) return
    seekTo(((e.clientX - r.left) / r.width) * duration)
  }

  if (!src) {
    return (
      <div className={`aspect-video w-full rounded-xl bg-muted flex flex-col items-center justify-center text-muted-foreground gap-2 ${className}`}>
        <AlertTriangle className="h-6 w-6" />
        <p className="text-sm">No video attached to this lesson yet.</p>
      </div>
    )
  }

  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      onMouseMove={bumpControls}
      onMouseLeave={() => { if (playing && menu === 'none') setShowControls(false) }}
      onFocus={bumpControls}
      className={`group relative w-full aspect-video rounded-xl overflow-hidden bg-black outline-none focus-visible:ring-2 focus-visible:ring-primary select-none ${fs ? 'rounded-none' : ''} ${className}`}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster ?? undefined}
        playsInline
        preload="metadata"
        autoPlay={autoPlay}
        className="absolute inset-0 h-full w-full object-contain"
        onClick={toggle}
        onDoubleClick={toggleFs}
        onLoadedMetadata={onLoaded}
        onTimeUpdate={onTime}
        onProgress={onTime}
        onPlay={() => { setPlaying(true); bumpControls() }}
        onPause={() => { setPlaying(false); setShowControls(true); report(true) }}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
        onEnded={() => { setPlaying(false); setShowControls(true); report(true, true); onEnded?.() }}
        onError={() => setError('This video could not be loaded. The link may have expired — reload the page to get a fresh one.')}
        onVolumeChange={() => { const v = videoRef.current; if (v) { setVolume(v.volume); setMuted(v.muted) } }}
      >
        {contentType && <source src={src} type={contentType} />}
      </video>

      {/* Centre state overlays */}
      {!playing && !error && (
        <button type="button" onClick={toggle} aria-label="Play" className="absolute inset-0 m-auto h-16 w-16 rounded-full bg-primary/90 text-primary-foreground flex items-center justify-center shadow-xl hover:scale-105 transition-transform">
          <Play className="h-7 w-7 ml-1" fill="currentColor" />
        </button>
      )}
      {waiting && playing && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><Loader2 className="h-9 w-9 text-white animate-spin" /></div>}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 text-white p-6 text-center">
          <AlertTriangle className="h-6 w-6 text-amber-400" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Title gradient */}
      {title && (
        <div className={`absolute top-0 inset-x-0 p-4 bg-gradient-to-b from-black/70 to-transparent transition-opacity ${showControls ? 'opacity-100' : 'opacity-0'}`}>
          <p className="text-sm font-medium text-white drop-shadow">{title}</p>
          {currentChapter && <p className="text-[11px] text-white/70">{currentChapter.title}</p>}
        </div>
      )}

      {/* Controls */}
      <div className={`absolute bottom-0 inset-x-0 px-3 pb-2 pt-10 bg-gradient-to-t from-black/85 via-black/40 to-transparent transition-opacity ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        {/* Scrubber */}
        <div
          ref={barRef}
          onClick={barSeek}
          onMouseMove={e => { const r = barRef.current?.getBoundingClientRect(); if (r) setHoverPct(((e.clientX - r.left) / r.width) * 100) }}
          onMouseLeave={() => setHoverPct(null)}
          className="relative h-1.5 hover:h-2.5 transition-all rounded-full bg-[rgba(255,255,255,0.25)] cursor-pointer mb-2.5"
          role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.floor(duration)} aria-valuenow={Math.floor(time)}
        >
          {buffered.map((b, i) => duration ? <div key={i} className="absolute inset-y-0 bg-[rgba(255,255,255,0.3)] rounded-full" style={{ left: `${(b.s / duration) * 100}%`, width: `${((b.e - b.s) / duration) * 100}%` }} /> : null)}
          <div className="absolute inset-y-0 left-0 bg-primary rounded-full" style={{ width: `${pct}%` }} />
          {duration > 0 && chapters.map((c, i) => c.startSec > 0 && (
            <div key={i} className="absolute top-0 bottom-0 w-0.5 bg-[rgba(255,255,255,0.8)]" style={{ left: `${(c.startSec / duration) * 100}%` }} title={c.title} />
          ))}
          <div className="absolute top-1/2 -translate-y-1/2 -ml-1.5 h-3 w-3 rounded-full bg-primary shadow opacity-0 group-hover:opacity-100 transition-opacity" style={{ left: `${pct}%` }} />
          {hoverPct !== null && duration > 0 && (
            <div className="absolute -top-7 -translate-x-1/2 rounded bg-black/90 px-1.5 py-0.5 text-[10px] font-mono text-white pointer-events-none" style={{ left: `${hoverPct}%` }}>
              {fmtDuration((hoverPct / 100) * duration)}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 text-white">
          <Ctl onClick={toggle} label={playing ? 'Pause (k)' : 'Play (k)'}>{playing ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="h-4 w-4" fill="currentColor" />}</Ctl>
          <Ctl onClick={() => seekBy(-10)} label="Back 10s (j)"><SkipBack className="h-4 w-4" /></Ctl>
          <Ctl onClick={() => seekBy(10)} label="Forward 10s (l)"><SkipForward className="h-4 w-4" /></Ctl>
          <div className="flex items-center gap-1 group/vol">
            <Ctl onClick={toggleMute} label="Mute (m)">{muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</Ctl>
            <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={e => setVol(Number(e.target.value))} aria-label="Volume"
              className="w-0 group-hover/vol:w-20 focus:w-20 transition-all accent-[hsl(var(--primary))] h-1 cursor-pointer" />
          </div>
          <span className="ml-1 font-mono text-[11px] tabular-nums text-white/90">{fmtDuration(time)} <span className="text-white/50">/ {fmtDuration(duration)}</span></span>
          <div className="flex-1" />
          {chapters.length > 0 && (
            <div className="relative">
              <Ctl onClick={() => setMenu(m => m === 'chapters' ? 'none' : 'chapters')} label="Chapters" active={menu === 'chapters'}><ListOrdered className="h-4 w-4" /></Ctl>
              {menu === 'chapters' && (
                <Menu onClose={() => setMenu('none')} title="Chapters">
                  {chapters.map((c, i) => (
                    <button key={i} type="button" onClick={() => { seekTo(c.startSec); setMenu('none') }} className={`w-full flex items-center justify-between gap-3 px-3 py-1.5 text-left text-xs hover:bg-[rgba(255,255,255,0.1)] ${currentChapter === c ? 'text-primary' : 'text-white'}`}>
                      <span className="truncate">{c.title}</span><span className="font-mono text-[10px] text-white/60">{fmtDuration(c.startSec)}</span>
                    </button>
                  ))}
                </Menu>
              )}
            </div>
          )}
          <div className="relative">
            <Ctl onClick={() => setMenu(m => m === 'speed' ? 'none' : 'speed')} label="Playback speed" active={menu === 'speed'}>
              <span className="flex items-center gap-1"><Settings2 className="h-4 w-4" /><span className="font-mono text-[10px]">{speed}x</span></span>
            </Ctl>
            {menu === 'speed' && (
              <Menu onClose={() => setMenu('none')} title="Speed">
                {SPEEDS.map(s => (
                  <button key={s} type="button" onClick={() => { setSpeed(s); setMenu('none') }} className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-white hover:bg-[rgba(255,255,255,0.1)]">
                    <span className="font-mono">{s}x</span>{s === speed && <Check className="h-3.5 w-3.5 text-primary" />}
                  </button>
                ))}
              </Menu>
            )}
          </div>
          {pipSupported && <Ctl onClick={togglePip} label="Picture in picture (p)"><PictureInPicture2 className="h-4 w-4" /></Ctl>}
          <Ctl onClick={toggleFs} label={fs ? 'Exit fullscreen (f)' : 'Fullscreen (f)'}>{fs ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}</Ctl>
        </div>
      </div>
    </div>
  )
}

function Ctl({ children, onClick, label, active }: { children: React.ReactNode; onClick: () => void; label: string; active?: boolean }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label}
      className={`h-8 min-w-8 px-1.5 rounded-md flex items-center justify-center hover:bg-[rgba(255,255,255,0.15)] transition-colors ${active ? 'bg-[rgba(255,255,255,0.15)]' : ''}`}>
      {children}
    </button>
  )
}

function Menu({ children, title, onClose }: { children: React.ReactNode; title: string; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="absolute bottom-10 right-0 w-56 max-h-64 overflow-y-auto rounded-lg bg-black/95 border border-[rgba(255,255,255,0.1)] shadow-xl py-1 z-10">
      <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-white/50">{title}</p>
      {children}
    </div>
  )
}
