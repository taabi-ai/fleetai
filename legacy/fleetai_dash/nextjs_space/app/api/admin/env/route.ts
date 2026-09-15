export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/admin'
import { withAudit } from '@/lib/audit'
import { BOOT_ONLY, KNOWN_VARS, invalidateEnvCache, looksSecret, mask } from '@/lib/env'

const KEY_RE = /^[A-Z][A-Z0-9_]{0,127}$/

/** Merged view: process environment + admin overrides. Secret values are masked. */
export async function GET() {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const rows = await prisma.envVar.findMany({ orderBy: { key: 'asc' } })
  const known = new Map(KNOWN_VARS.map(k => [k.key, k]))
  const keys = new Set<string>()
  KNOWN_VARS.forEach(k => keys.add(k.key))
  rows.forEach(r => keys.add(r.key))
  for (const k of Object.keys(process.env)) {
    // Hide framework/runtime noise; keep app-relevant variables.
    if (/^(npm_|YARN_|NEXT_RUNTIME|__NEXT|NODE_OPTIONS|PATH$|HOME$|PWD$|SHLVL|LANG|TERM|USER$|LOGNAME|SHELL$|_$|OLDPWD|XDG_|DISPLAY|LS_COLORS|LESS|INIT_CWD|COLOR|EDITOR|MAIL$|HOSTTYPE|DEBIAN|TZ$|TMPDIR|COREPACK|BERRY|PROJECT_CWD|npm_)/.test(k)) continue
    keys.add(k)
  }
  const rMap = new Map(rows.map(r => [r.key, r]))
  const items = Array.from(keys).sort().map(key => {
    const r = rMap.get(key)
    const meta = known.get(key)
    const processValue = process.env[key]
    const isSecret = r?.isSecret ?? meta?.secret ?? looksSecret(key)
    const effective = r?.value && r.value !== '' ? r.value : (processValue ?? '')
    return {
      key,
      group: meta?.group ?? (r ? 'Custom' : 'Process'),
      description: r?.description ?? meta?.description ?? null,
      isSecret,
      bootOnly: BOOT_ONLY.includes(key),
      hasOverride: !!r,
      hasProcessValue: processValue !== undefined,
      value: effective ? (isSecret ? mask(effective) : effective) : '',
      isSet: effective !== '',
      updatedAt: r?.updatedAt ?? null,
    }
  })
  return NextResponse.json({ items })
}

/** Create or update an override. Empty value for a secret keeps the stored value. */
async function _PUT(request: Request) {
  const session = await auth()
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const key = String(body.key ?? '').trim()
  if (!KEY_RE.test(key)) return NextResponse.json({ error: 'Key must be UPPER_SNAKE_CASE (letters, digits, underscore)' }, { status: 400 })
  const existing = await prisma.envVar.findUnique({ where: { key } })
  const isSecret = typeof body.isSecret === 'boolean' ? body.isSecret : (existing?.isSecret ?? looksSecret(key))
  let value = body.value === undefined || body.value === null ? '' : String(body.value)
  if (value === '' && existing && isSecret && body.clear !== true) value = existing.value // keep stored secret
  if (value.length > 20_000) return NextResponse.json({ error: 'Value too long' }, { status: 400 })
  const description = body.description === undefined ? existing?.description ?? null : (body.description ? String(body.description).slice(0, 500) : null)
  const row = await prisma.envVar.upsert({
    where: { key },
    update: { value, isSecret, description, updatedById: session!.user.id },
    create: { key, value, isSecret, description, updatedById: session!.user.id },
  })
  invalidateEnvCache()
  return NextResponse.json({ key: row.key, isSecret: row.isSecret, description: row.description, updatedAt: row.updatedAt, bootOnly: BOOT_ONLY.includes(key), label: key })
}

/** Remove an override (falls back to the process environment). */
async function _DELETE(request: Request) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const key = new URL(request.url).searchParams.get('key') ?? ''
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 })
  await prisma.envVar.deleteMany({ where: { key } })
  invalidateEnvCache()
  return NextResponse.json({ ok: true, key, label: key })
}

export const PUT = withAudit(_PUT, { entity: 'env_var', verbs: { PUT: 'set' } })
export const DELETE = withAudit(_DELETE, { entity: 'env_var', verbs: { DELETE: 'delete' } })
