import {
  S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand, ListObjectsV2Command,
  CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createS3Client, getBucketConfig } from '@/lib/aws-config'
import { getEnvMany } from '@/lib/env'

/**
 * Object storage abstraction.
 *
 * One S3-compatible driver serves every backend: MinIO (self-hosted), AWS S3, Backblaze B2, Cloudflare R2,
 * DigitalOcean Spaces … Selecting a backend is purely configuration (Admin → Environment variables):
 *   S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_FORCE_PATH_STYLE, S3_PUBLIC_BASE_URL, S3_PREFIX
 * When S3_BUCKET is not set the platform-managed bucket (AWS_* variables) is used.
 *
 * Only `cloud_storage_path` (the object key) and `isPublic` are persisted in the database, so migrating
 * between backends is a bucket copy plus a configuration change.
 */

export type StorageBackend = {
  kind: 'custom' | 'platform'
  label: string
  endpoint: string | null
  region: string
  bucket: string
  prefix: string
  forcePathStyle: boolean
  publicBaseUrl: string | null
}

type Resolved = { client: S3Client; backend: StorageBackend }

let cached: { at: number; sig: string; resolved: Resolved } | null = null
const CACHE_MS = 15_000

function normPrefix(p: string) {
  const t = p.trim().replace(/^\/+/, '')
  return t === '' ? '' : t.endsWith('/') ? t : `${t}/`
}

export async function resolveStorage(): Promise<Resolved> {
  const env = await getEnvMany(['S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_FORCE_PATH_STYLE', 'S3_PUBLIC_BASE_URL', 'S3_PREFIX'])
  const sig = JSON.stringify(env)
  if (cached && cached.sig === sig && Date.now() - cached.at < CACHE_MS) return cached.resolved

  let resolved: Resolved
  if (env.S3_BUCKET) {
    const endpoint = env.S3_ENDPOINT?.replace(/\/$/, '') || null
    const forcePathStyle = /^(1|true|yes)$/i.test(env.S3_FORCE_PATH_STYLE) || (!!endpoint && /localhost|127\.0\.0\.1|minio|:9000/.test(endpoint))
    const region = env.S3_REGION || 'us-east-1'
    const client = new S3Client({
      region,
      ...(endpoint ? { endpoint } : {}),
      forcePathStyle,
      ...(env.S3_ACCESS_KEY && env.S3_SECRET_KEY ? { credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY } } : {}),
    })
    const host = endpoint ? new URL(endpoint).hostname : 's3.amazonaws.com'
    const label = /backblaze/i.test(host) ? 'Backblaze B2' : /r2\.cloudflarestorage/i.test(host) ? 'Cloudflare R2' : /digitaloceanspaces/i.test(host) ? 'DigitalOcean Spaces' : /amazonaws/i.test(host) ? 'AWS S3' : endpoint ? 'MinIO / S3-compatible' : 'AWS S3'
    resolved = {
      client,
      backend: { kind: 'custom', label, endpoint, region, bucket: env.S3_BUCKET, prefix: normPrefix(env.S3_PREFIX), forcePathStyle, publicBaseUrl: env.S3_PUBLIC_BASE_URL?.replace(/\/$/, '') || null },
    }
  } else {
    const cfg = getBucketConfig()
    resolved = {
      client: createS3Client(),
      backend: { kind: 'platform', label: 'Platform storage (S3)', endpoint: null, region: process.env.AWS_REGION ?? 'us-east-1', bucket: cfg.bucketName, prefix: normPrefix(cfg.folderPrefix), forcePathStyle: false, publicBaseUrl: null },
    }
  }
  cached = { at: Date.now(), sig, resolved }
  return resolved
}

export function invalidateStorageCache() {
  cached = null
}

function shouldServeInline(contentType: string): boolean {
  // image/svg+xml excluded — SVGs can execute embedded scripts (XSS risk)
  return (contentType.startsWith('image/') && contentType !== 'image/svg+xml')
    || contentType.startsWith('video/')
    || contentType.startsWith('audio/')
    || contentType === 'application/pdf'
}

export function safeFileName(name: string) {
  return name.replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').slice(0, 120) || 'file'
}

/** Builds the object key. Public objects live under public/ so bucket policies can expose that prefix only. */
export function buildObjectPath(prefix: string, folder: string, fileName: string, isPublic: boolean) {
  const f = normPrefix(folder).replace(/\.\./g, '')
  return `${prefix}${isPublic ? 'public/' : ''}uploads/${f}${Date.now()}-${safeFileName(fileName)}`
}

export async function generatePresignedUploadUrl(fileName: string, contentType: string, isPublic = false, folder = 'media') {
  const { client, backend } = await resolveStorage()
  const cloud_storage_path = buildObjectPath(backend.prefix, folder, fileName, isPublic)
  const cmd = new PutObjectCommand({ Bucket: backend.bucket, Key: cloud_storage_path, ContentType: contentType })
  const uploadUrl = await getSignedUrl(client, cmd, { expiresIn: 3600 })
  return { uploadUrl, cloud_storage_path }
}

export async function initiateMultipartUpload(fileName: string, contentType: string, isPublic = false, folder = 'media') {
  const { client, backend } = await resolveStorage()
  const cloud_storage_path = buildObjectPath(backend.prefix, folder, fileName, isPublic)
  const res = await client.send(new CreateMultipartUploadCommand({ Bucket: backend.bucket, Key: cloud_storage_path, ContentType: contentType }))
  return { uploadId: res.UploadId!, cloud_storage_path }
}

export async function getPresignedUrlForPart(cloud_storage_path: string, uploadId: string, partNumber: number) {
  const { client, backend } = await resolveStorage()
  return getSignedUrl(client, new UploadPartCommand({ Bucket: backend.bucket, Key: cloud_storage_path, UploadId: uploadId, PartNumber: partNumber }), { expiresIn: 3600 })
}

export async function completeMultipartUpload(cloud_storage_path: string, uploadId: string, parts: { ETag: string; PartNumber: number }[]) {
  const { client, backend } = await resolveStorage()
  await client.send(new CompleteMultipartUploadCommand({
    Bucket: backend.bucket, Key: cloud_storage_path, UploadId: uploadId,
    MultipartUpload: { Parts: [...parts].sort((a, b) => a.PartNumber - b.PartNumber) },
  }))
}

export async function abortMultipartUpload(cloud_storage_path: string, uploadId: string) {
  const { client, backend } = await resolveStorage()
  await client.send(new AbortMultipartUploadCommand({ Bucket: backend.bucket, Key: cloud_storage_path, UploadId: uploadId }))
}

function encodeKey(key: string) {
  return key.split('/').map(encodeURIComponent).join('/')
}

/** Public URL or time-limited signed URL. Signed URLs must be generated on demand, never stored. */
export async function getFileUrl(cloud_storage_path: string, contentType: string, isPublic: boolean, expiresIn = 3600) {
  const { client, backend } = await resolveStorage()
  if (isPublic) {
    if (backend.publicBaseUrl) return `${backend.publicBaseUrl}/${encodeKey(cloud_storage_path)}`
    if (backend.endpoint) {
      return backend.forcePathStyle
        ? `${backend.endpoint}/${backend.bucket}/${encodeKey(cloud_storage_path)}`
        : `${backend.endpoint.replace('://', `://${backend.bucket}.`)}/${encodeKey(cloud_storage_path)}`
    }
    return `https://${backend.bucket}.s3.${backend.region}.amazonaws.com/${encodeKey(cloud_storage_path)}`
  }
  return getSignedUrl(client, new GetObjectCommand({
    Bucket: backend.bucket, Key: cloud_storage_path,
    ResponseContentDisposition: shouldServeInline(contentType) ? 'inline' : 'attachment',
  }), { expiresIn })
}

export async function deleteFile(cloud_storage_path: string) {
  const { client, backend } = await resolveStorage()
  await client.send(new DeleteObjectCommand({ Bucket: backend.bucket, Key: cloud_storage_path }))
}

/** Server-side upload for scripts/seeding (not used by the browser flow). */
export async function putObject(cloud_storage_path: string, body: Buffer | Uint8Array, contentType: string) {
  const { client, backend } = await resolveStorage()
  await client.send(new PutObjectCommand({ Bucket: backend.bucket, Key: cloud_storage_path, Body: body, ContentType: contentType }))
}

/** Connectivity check used by the admin console “Test storage” button. */
export async function testStorage() {
  const { client, backend } = await resolveStorage()
  const started = Date.now()
  if (!backend.bucket) return { ok: false, backend, message: 'No bucket configured', ms: 0 }
  try {
    await client.send(new HeadBucketCommand({ Bucket: backend.bucket }))
    const list = await client.send(new ListObjectsV2Command({ Bucket: backend.bucket, Prefix: backend.prefix, MaxKeys: 1 }))
    return { ok: true, backend, message: `Bucket reachable (${(list.KeyCount ?? 0) > 0 ? 'objects present' : 'empty prefix'})`, ms: Date.now() - started }
  } catch (e) {
    return { ok: false, backend, message: (e as Error)?.message ?? 'Connection failed', ms: Date.now() - started }
  }
}
