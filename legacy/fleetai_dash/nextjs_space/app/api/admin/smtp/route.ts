export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/admin'
import { buildTransport, emailLayout, getSmtpSettings } from '@/lib/mailer'
import { withAudit } from '@/lib/audit'

function mask(s: { password: string | null } | null) {
  if (!s) return null
  return { ...s, password: undefined, hasPassword: !!s.password }
}

export async function GET() {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return NextResponse.json(mask(await getSmtpSettings()))
}

// PUT - save SMTP settings
async function _PUT(request: Request) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const host = String(body?.host ?? '').trim()
  const port = Number(body?.port ?? 587)
  const fromEmail = String(body?.fromEmail ?? '').trim()
  if (!host || !fromEmail || !Number.isFinite(port)) return NextResponse.json({ error: 'Host, port and FROM email are required' }, { status: 400 })
  const existing = await getSmtpSettings()
  const password = typeof body?.password === 'string' && body.password ? body.password : (existing?.password ?? null)
  const data = {
    host, port, fromEmail,
    secure: !!body?.secure,
    username: typeof body?.username === 'string' ? body.username.trim() || null : null,
    password,
    fromName: typeof body?.fromName === 'string' ? body.fromName.trim() || null : null,
    replyTo: typeof body?.replyTo === 'string' ? body.replyTo.trim() || null : null,
  }
  const saved = await prisma.smtpSetting.upsert({ where: { id: 'default' }, update: data, create: { id: 'default', ...data } })
  return NextResponse.json(mask(saved))
}

// POST - send a test email to the given address using saved settings
async function _POST(request: Request) {
  const session = await requireSuperAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const to = String(body?.to ?? session.user.email ?? '').trim()
  const s = await getSmtpSettings()
  if (!s) return NextResponse.json({ ok: false, error: 'Save SMTP settings first' })
  try {
    const transport = buildTransport(s)
    await transport.verify()
    await transport.sendMail({
      from: s.fromName ? `"${s.fromName}" <${s.fromEmail}>` : s.fromEmail,
      replyTo: s.replyTo || undefined,
      to,
      subject: 'FleetAI Dash — SMTP test',
      html: emailLayout('SMTP is working', `This test message was sent from FleetAI Dash via <b>${s.host}:${s.port}</b>.`),
      text: `SMTP test from FleetAI Dash via ${s.host}:${s.port}`,
    })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Failed to send' })
  }
}

async function _DELETE() {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  await prisma.smtpSetting.deleteMany({ where: { id: 'default' } })
  return NextResponse.json({ success: true })
}

export const PUT = withAudit(_PUT, { entity: 'smtp', verbs: { PUT: 'update' } })
export const POST = withAudit(_POST, { entity: 'smtp', verbs: { POST: 'test' } })
export const DELETE = withAudit(_DELETE, { entity: 'smtp', verbs: { DELETE: 'delete' } })
