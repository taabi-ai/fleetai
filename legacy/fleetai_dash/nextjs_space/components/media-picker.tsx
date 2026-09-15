'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Film, FileText, Image as ImageIcon, Music, File, Loader2, Search, UploadCloud, Check } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import { uploadFile, fmtBytes, fmtDuration, type UploadedAsset } from '@/lib/upload-client'

export const KIND_ICON: Record<string, typeof Film> = { video: Film, image: ImageIcon, document: FileText, audio: Music, other: File }

type Props = {
  open: boolean
  onOpenChange: (o: boolean) => void
  onSelect: (asset: UploadedAsset) => void
  kind?: string
  folder?: string
  title?: string
}

/** Pick an existing media asset or upload a new one. Used by the training editor. */
export function MediaPicker({ open, onOpenChange, onSelect, kind, folder = 'training', title = 'Select media' }: Props) {
  const [items, setItems] = useState<UploadedAsset[]>([])
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams()
    if (kind) p.set('kind', kind)
    if (q) p.set('q', q)
    const res = await fetch(`/api/media?${p}`)
    if (res.ok) setItems((await res.json()).items)
    setLoading(false)
  }, [kind, q])

  useEffect(() => { if (open) load() }, [open, load])

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setProgress(0)
    try {
      const asset = await uploadFile(f, { folder, kind, onProgress: setProgress })
      toast.success('Uploaded')
      onSelect(asset)
      onOpenChange(false)
    } catch (err) {
      toast.error((err as Error).message)
    } finally { setProgress(null) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Choose an asset from the media library or upload a new file.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by title or file name" className="pl-8 h-9" />
          </div>
          <input ref={fileRef} type="file" className="hidden" onChange={onFile} accept={kind === 'video' ? 'video/*' : kind === 'image' ? 'image/*' : undefined} />
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={progress !== null}>
            {progress !== null ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <UploadCloud className="h-3.5 w-3.5 mr-1.5" />}Upload
          </Button>
        </div>
        {progress !== null && (
          <div className="space-y-1">
            <Progress value={progress} className="h-1.5" />
            <p className="text-[11px] text-muted-foreground">Uploading… {progress}%</p>
          </div>
        )}
        <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-border divide-y divide-border">
          {loading ? (
            <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : items.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No assets yet. Upload one to get started.</p>
          ) : items.map(a => {
            const Icon = KIND_ICON[a.kind] ?? File
            return (
              <button key={a.id} type="button" onClick={() => { onSelect(a); onOpenChange(false) }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60 transition-colors">
                <span className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center flex-shrink-0"><Icon className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground truncate">{a.title}</span>
                  <span className="block text-[11px] text-muted-foreground truncate">{a.fileName} · {fmtBytes(a.size)}{a.durationSec ? ` · ${fmtDuration(a.durationSec)}` : ''}</span>
                </span>
                <Badge variant="outline" className="text-[10px] capitalize">{a.kind}</Badge>
                <Check className="h-4 w-4 text-muted-foreground/40" />
              </button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
