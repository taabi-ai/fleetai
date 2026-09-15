'use client'

/**
 * Browser-side upload helper. ≤100 MB → single presigned PUT; larger → multipart (100 MB parts).
 * Never sends the file through the app server, so the same code works for MinIO, S3, B2, R2 …
 */

export type UploadOptions = {
  folder?: string
  isPublic?: boolean
  title?: string
  kind?: string
  durationSec?: number | null
  onProgress?: (pct: number) => void
}

export type UploadedAsset = {
  id: string; kind: string; title: string; fileName: string; contentType: string; size: number
  cloud_storage_path: string; isPublic: boolean; folder: string; durationSec: number | null; createdAt: string
}

const PART_SIZE = 100 * 1024 * 1024
const SINGLE_LIMIT = 100 * 1024 * 1024

async function readErr(res: Response, fallback: string) {
  try { const d = await res.json(); return d?.error ?? fallback } catch { return fallback }
}

function putWithProgress(url: string, body: Blob, contentType: string, onProgress?: (loaded: number) => void): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress?.(e.loaded) }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.getResponseHeader('ETag'))
      else reject(new Error(`Storage rejected the upload (HTTP ${xhr.status}). If you use a custom S3/MinIO bucket, check its CORS policy.`))
    }
    xhr.onerror = () => reject(new Error('Network error while uploading. If you use a custom S3/MinIO bucket, check its CORS policy allows PUT from this origin.'))
    xhr.send(body)
  })
}

/** Reads the duration of a local video/audio file (seconds) without uploading it. */
export function probeDuration(file: File): Promise<number | null> {
  if (!/^(video|audio)\//.test(file.type)) return Promise.resolve(null)
  return new Promise(resolve => {
    const el = document.createElement(file.type.startsWith('audio') ? 'audio' : 'video')
    const url = URL.createObjectURL(file)
    const done = (v: number | null) => { URL.revokeObjectURL(url); resolve(v) }
    el.preload = 'metadata'
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? Math.round(el.duration) : null)
    el.onerror = () => done(null)
    el.src = url
  })
}

export async function uploadFile(file: File, opts: UploadOptions = {}): Promise<UploadedAsset> {
  const contentType = file.type || 'application/octet-stream'
  const base = { fileName: file.name, contentType, size: file.size, folder: opts.folder ?? 'media', isPublic: !!opts.isPublic }
  let cloud_storage_path: string

  if (file.size <= SINGLE_LIMIT) {
    const res = await fetch('/api/media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(base) })
    if (!res.ok) throw new Error(await readErr(res, 'Could not start upload'))
    const { uploadUrl, cloud_storage_path: p } = await res.json()
    cloud_storage_path = p
    await putWithProgress(uploadUrl, file, contentType, loaded => opts.onProgress?.(Math.round((loaded / file.size) * 100)))
  } else {
    const init = await fetch('/api/media/multipart/initiate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(base) })
    if (!init.ok) throw new Error(await readErr(init, 'Could not start multipart upload'))
    const { uploadId, cloud_storage_path: p } = await init.json()
    cloud_storage_path = p
    const parts: { ETag: string; PartNumber: number }[] = []
    const total = Math.ceil(file.size / PART_SIZE)
    let uploadedBytes = 0
    try {
      for (let i = 0; i < total; i++) {
        const chunk = file.slice(i * PART_SIZE, Math.min(file.size, (i + 1) * PART_SIZE))
        const pr = await fetch('/api/media/multipart/part', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cloud_storage_path, uploadId, partNumber: i + 1 }) })
        if (!pr.ok) throw new Error(await readErr(pr, 'Could not sign upload part'))
        const { url } = await pr.json()
        const etag = await putWithProgress(url, chunk, contentType, loaded => opts.onProgress?.(Math.round(((uploadedBytes + loaded) / file.size) * 100)))
        uploadedBytes += chunk.size
        if (!etag) throw new Error('Storage did not return an ETag for a part. If you use a custom bucket, expose the ETag header in its CORS policy.')
        parts.push({ ETag: etag, PartNumber: i + 1 })
      }
      const done = await fetch('/api/media/multipart/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cloud_storage_path, uploadId, parts }) })
      if (!done.ok) throw new Error(await readErr(done, 'Could not complete multipart upload'))
    } catch (e) {
      await fetch('/api/media/multipart/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cloud_storage_path, uploadId, abort: true }) }).catch(() => {})
      throw e
    }
  }

  const durationSec = opts.durationSec ?? (await probeDuration(file))
  const complete = await fetch('/api/media/complete', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...base, cloud_storage_path, title: opts.title ?? file.name, kind: opts.kind, durationSec }),
  })
  if (!complete.ok) throw new Error(await readErr(complete, 'Upload finished but the asset could not be recorded'))
  const { asset } = await complete.json()
  opts.onProgress?.(100)
  return asset as UploadedAsset
}

/** Triggers a browser download / open via a signed URL (uses an <a> click so CORS never gets in the way). */
export async function openAsset(id: string, download = false) {
  const res = await fetch(`/api/media/${id}`)
  if (!res.ok) throw new Error(await readErr(res, 'Could not resolve file URL'))
  const { url, asset } = await res.json()
  const a = document.createElement('a')
  a.href = url
  if (download) a.download = asset.fileName
  else { a.target = '_blank'; a.rel = 'noopener' }
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

export function fmtDuration(sec: number | null | undefined) {
  if (sec == null || !Number.isFinite(sec)) return '—'
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
}
