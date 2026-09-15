import { prisma } from '@/lib/db'

/**
 * Runtime environment variables.
 *
 * Super admins can manage variables from the admin console (EnvVar table). A database
 * override always wins over the process environment so config can change without a
 * redeploy. Values are cached for a short time to keep hot paths cheap.
 *
 * Boot-time variables (DATABASE_URL, NEXTAUTH_SECRET/AUTH_SECRET, NEXTAUTH_URL) are read by
 * the framework before this module runs — overrides for those only take effect on restart.
 */

const CACHE_MS = 15_000
let cache: { at: number; map: Map<string, string> } | null = null

/** Names that are consumed by the platform/framework itself and cannot be overridden at runtime. */
export const BOOT_ONLY = ['DATABASE_URL', 'NEXTAUTH_SECRET', 'AUTH_SECRET', 'NEXTAUTH_URL', 'NODE_ENV', 'PORT', 'HOSTNAME']

/** Well-known variables the app understands, shown in the admin console even when unset. */
export const KNOWN_VARS: { key: string; description: string; secret: boolean; group: string }[] = [
  { key: 'ABACUSAI_API_KEY', description: 'Built-in LLM gateway key (RouteLLM). Used when no custom LLM provider is active.', secret: true, group: 'AI' },
  { key: 'S3_ENDPOINT', description: 'S3-compatible endpoint, e.g. http://minio:9000 or https://s3.us-west-004.backblazeb2.com. Leave blank for AWS S3 / platform storage.', secret: false, group: 'Storage' },
  { key: 'S3_REGION', description: 'Region for the S3-compatible bucket (MinIO accepts any value, e.g. us-east-1).', secret: false, group: 'Storage' },
  { key: 'S3_BUCKET', description: 'Bucket name for documents, videos and media.', secret: false, group: 'Storage' },
  { key: 'S3_ACCESS_KEY', description: 'Access key ID for the S3-compatible bucket.', secret: true, group: 'Storage' },
  { key: 'S3_SECRET_KEY', description: 'Secret access key for the S3-compatible bucket.', secret: true, group: 'Storage' },
  { key: 'S3_FORCE_PATH_STYLE', description: 'Set to true for MinIO and most self-hosted S3 servers (bucket in path instead of subdomain).', secret: false, group: 'Storage' },
  { key: 'S3_PUBLIC_BASE_URL', description: 'Optional public/CDN base URL for public objects (e.g. https://cdn.example.com). Defaults to the endpoint + bucket.', secret: false, group: 'Storage' },
  { key: 'S3_PREFIX', description: 'Optional key prefix (folder) inside the bucket, e.g. fleetdash/.', secret: false, group: 'Storage' },
  { key: 'AWS_REGION', description: 'Platform-managed storage region (fallback when S3_* is not configured).', secret: false, group: 'Platform storage' },
  { key: 'AWS_BUCKET_NAME', description: 'Platform-managed storage bucket (fallback).', secret: false, group: 'Platform storage' },
  { key: 'AWS_FOLDER_PREFIX', description: 'Platform-managed storage key prefix (fallback).', secret: false, group: 'Platform storage' },
  { key: 'AWS_PROFILE', description: 'Platform-managed credentials profile (fallback).', secret: false, group: 'Platform storage' },
  { key: 'DATABASE_URL', description: 'Database connection string (boot-time, read-only here).', secret: true, group: 'Core' },
  { key: 'NEXTAUTH_URL', description: 'Public URL of the app (boot-time).', secret: false, group: 'Core' },
  { key: 'NEXTAUTH_SECRET', description: 'Session signing secret (boot-time).', secret: true, group: 'Core' },
  { key: 'AUTH_SECRET', description: 'Session signing secret alias (boot-time).', secret: true, group: 'Core' },
]

const SECRET_RE = /(secret|password|passwd|token|api[_-]?key|private|credential|access[_-]?key|database_url)/i
export function looksSecret(key: string) {
  return SECRET_RE.test(key)
}

async function overrides(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.map
  try {
    const rows = await prisma.envVar.findMany({ select: { key: true, value: true } })
    cache = { at: Date.now(), map: new Map(rows.map(r => [r.key, r.value])) }
  } catch {
    cache = { at: Date.now(), map: cache?.map ?? new Map() }
  }
  return cache.map
}

export function invalidateEnvCache() {
  cache = null
}

/** Resolve a variable: admin override first, then process.env. */
export async function getEnv(key: string, fallback = ''): Promise<string> {
  const o = await overrides()
  const v = o.get(key)
  if (v !== undefined && v !== '') return v
  return process.env[key] ?? fallback
}

export async function getEnvMany<K extends string>(keys: K[]): Promise<Record<K, string>> {
  const o = await overrides()
  const out = {} as Record<K, string>
  for (const k of keys) {
    const v = o.get(k)
    out[k] = v !== undefined && v !== '' ? v : (process.env[k] ?? '')
  }
  return out
}

export function mask(value: string) {
  if (!value) return ''
  if (value.length <= 6) return '•'.repeat(value.length)
  return `${value.slice(0, 3)}${'•'.repeat(Math.min(12, value.length - 5))}${value.slice(-2)}`
}
