'use client'

import { useEffect, useState } from 'react'
import { Loader2, Mail, Send, Trash2, CheckCircle2, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { PageHeader, Panel, Field, readErr } from '../_components/ui-bits'

const empty = { host: '', port: '587', secure: false, username: '', password: '', fromEmail: '', fromName: '', replyTo: '' }

export default function SmtpPage() {
  const [form, setForm] = useState({ ...empty })
  const [hasPassword, setHasPassword] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testTo, setTestTo] = useState('')
  const [testing, setTesting] = useState(false)

  const load = async () => {
    setLoading(true)
    const res = await fetch('/api/admin/smtp')
    if (res.ok) {
      const d = await res.json()
      if (d) {
        setConfigured(true)
        setHasPassword(!!d.hasPassword)
        setForm({ host: d.host ?? '', port: String(d.port ?? 587), secure: !!d.secure, username: d.username ?? '', password: '', fromEmail: d.fromEmail ?? '', fromName: d.fromName ?? '', replyTo: d.replyTo ?? '' })
      } else { setConfigured(false) }
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/smtp', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, port: Number(form.port) }) })
      if (!res.ok) { toast.error(await readErr(res, 'Failed to save')); return }
      toast.success('SMTP settings saved')
      load()
    } finally { setSaving(false) }
  }

  const sendTest = async () => {
    if (!testTo) return
    setTesting(true)
    try {
      const res = await fetch('/api/admin/smtp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: testTo }) })
      const d = await res.json().catch(() => ({ ok: false }))
      if (d.ok) toast.success(`Test email sent to ${testTo}`); else toast.error(d.error ?? 'Failed to send')
    } finally { setTesting(false) }
  }

  const clear = async () => {
    if (!confirm('Remove SMTP configuration? Email notifications will stop; in-app notifications continue.')) return
    const res = await fetch('/api/admin/smtp', { method: 'DELETE' })
    if (res.ok) { toast.success('SMTP configuration removed'); setForm({ ...empty }); setConfigured(false); setHasPassword(false) }
  }

  const zepto = (region: 'in' | 'com') => setForm(f => ({ ...f, host: `smtp.zeptomail.${region}`, port: '587', secure: false, username: 'emailapikey' }))

  return (
    <div>
      <PageHeader
        title="SMTP / Email"
        description="Outgoing mail server used for dashboard share and publish notifications. Works with ZeptoMail, SES, SendGrid, Gmail or any SMTP relay."
        actions={configured ? <Button variant="ghost" size="sm" onClick={clear} className="gap-1 text-destructive hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /> Remove</Button> : undefined}
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel className="p-5 lg:col-span-2 space-y-4">
          {loading ? <div className="text-xs text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline" /></div> : (
            <>
              <div className="flex items-center gap-2 text-xs">
                <span className={`w-2 h-2 rounded-full ${configured ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                {configured ? 'SMTP configured' : 'Not configured — notifications are in-app only'}
                <span className="ml-auto flex items-center gap-1">
                  <span className="text-muted-foreground">Quick fill:</span>
                  <Button variant="outline" size="sm" className="h-6 text-[10px] border-white/10" onClick={() => zepto('in')}>ZeptoMail (IN)</Button>
                  <Button variant="outline" size="sm" className="h-6 text-[10px] border-white/10" onClick={() => zepto('com')}>ZeptoMail (Global)</Button>
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2"><Field label="SMTP host" htmlFor="s-host"><Input id="s-host" value={form.host} onChange={e => setForm({ ...form, host: e.target.value })} placeholder="smtp.zeptomail.in" className="font-mono text-xs" /></Field></div>
                <Field label="Port" htmlFor="s-port"><Input id="s-port" type="number" value={form.port} onChange={e => setForm({ ...form, port: e.target.value })} className="font-mono text-xs" /></Field>
              </div>
              <div className="flex items-center gap-2 text-xs"><Switch checked={form.secure} onCheckedChange={v => setForm({ ...form, secure: v })} /> Use implicit TLS (SSL, usually port 465). Leave off for STARTTLS on 587.</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Username" htmlFor="s-user" hint="ZeptoMail uses the literal username “emailapikey”."><Input id="s-user" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} className="font-mono text-xs" autoComplete="off" /></Field>
                <Field label={hasPassword ? 'Password / API token (blank = keep saved)' : 'Password / API token'} htmlFor="s-pass"><Input id="s-pass" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="font-mono text-xs" autoComplete="new-password" /></Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="FROM email" htmlFor="s-from" hint="Must be a verified sender domain at your provider."><Input id="s-from" type="email" value={form.fromEmail} onChange={e => setForm({ ...form, fromEmail: e.target.value })} placeholder="noreply@taabi.ai" /></Field>
                <Field label="FROM name" htmlFor="s-fromname"><Input id="s-fromname" value={form.fromName} onChange={e => setForm({ ...form, fromName: e.target.value })} placeholder="FleetAI Dash" /></Field>
              </div>
              <Field label="REPLY-TO email" htmlFor="s-reply"><Input id="s-reply" type="email" value={form.replyTo} onChange={e => setForm({ ...form, replyTo: e.target.value })} placeholder="support@taabi.ai" /></Field>
              <div className="flex justify-end">
                <Button onClick={save} disabled={saving || !form.host || !form.fromEmail} className="gap-1">{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Save settings</Button>
              </div>
            </>
          )}
        </Panel>
        <div className="space-y-4">
          <Panel className="p-5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold"><Send className="w-3.5 h-3.5 text-primary" /> Send a test email</div>
            <p className="text-[11px] text-muted-foreground">Uses the saved settings above. Save first if you changed anything.</p>
            <Input type="email" value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="you@company.com" className="text-xs" />
            <Button variant="outline" size="sm" onClick={sendTest} disabled={testing || !testTo || !configured} className="w-full gap-1 border-white/10">{testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />} Send test</Button>
          </Panel>
          <Panel className="p-5 space-y-2 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground"><Info className="w-3.5 h-3.5 text-primary" /> ZeptoMail quick guide</div>
            <p>1. In ZeptoMail create a Mail Agent and verify your sending domain.</p>
            <p>2. Under the agent&apos;s <b>SMTP</b> tab copy the send-mail token.</p>
            <p>3. Host <span className="font-mono">smtp.zeptomail.in</span> (India DC) or <span className="font-mono">smtp.zeptomail.com</span>, port 587 (STARTTLS) or 465 (SSL).</p>
            <p>4. Username is <span className="font-mono">emailapikey</span>; password is the token.</p>
          </Panel>
        </div>
      </div>
    </div>
  )
}
