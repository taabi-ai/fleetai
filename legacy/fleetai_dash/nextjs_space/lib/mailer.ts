import nodemailer from 'nodemailer'
import { prisma } from '@/lib/db'

export async function getSmtpSettings() {
  return prisma.smtpSetting.findUnique({ where: { id: 'default' } })
}

export function buildTransport(s: { host: string; port: number; secure: boolean; username?: string | null; password?: string | null }) {
  return nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.secure,
    auth: s.username ? { user: s.username, pass: s.password ?? '' } : undefined,
  })
}

/**
 * Sends an email using the SMTP server configured by the super admin.
 * Silently no-ops (returns false) when SMTP has not been configured.
 */
export async function sendMail(opts: { to: string | string[]; subject: string; html: string; text?: string }) {
  const s = await getSmtpSettings()
  if (!s?.host || !s.fromEmail) return false
  const transport = buildTransport(s)
  await transport.sendMail({
    from: s.fromName ? `"${s.fromName}" <${s.fromEmail}>` : s.fromEmail,
    replyTo: s.replyTo || undefined,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  })
  return true
}

export function emailLayout(title: string, body: string, ctaLabel?: string, ctaUrl?: string) {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#0F1117;font-family:Arial,Helvetica,sans-serif;color:#E5E7EB">
  <div style="max-width:560px;margin:0 auto;background:#1A1F2E;border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:28px">
    <div style="font-size:12px;letter-spacing:.08em;color:#818CF8;font-weight:700;margin-bottom:12px">FLEETAI DASH</div>
    <h1 style="font-size:20px;margin:0 0 12px;color:#fff">${title}</h1>
    <div style="font-size:14px;line-height:1.6;color:#CBD5E1">${body}</div>
    ${ctaUrl ? `<a href="${ctaUrl}" style="display:inline-block;margin-top:20px;background:#6366F1;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px">${ctaLabel ?? 'Open'}</a>` : ''}
  </div></body></html>`
}
