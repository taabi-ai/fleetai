'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck, ShieldOff, Lock } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

export function PinSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [hasPin, setHasPin] = useState<boolean | null>(null)
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'set' | 'remove'>('set')

  useEffect(() => {
    if (!open) return
    setPin(''); setConfirmPin(''); setPassword(''); setMode('set')
    fetch('/api/user/ai-pin').then(r => r.ok ? r.json() : { hasPin: false }).then(d => setHasPin(!!d?.hasPin)).catch(() => setHasPin(false))
  }, [open])

  const notify = () => window.dispatchEvent(new Event('fleetai:pin-changed'))

  const handleSave = async () => {
    if (!/^\d{4,8}$/.test(pin)) return toast.error('PIN must be 4 to 8 digits')
    if (pin !== confirmPin) return toast.error('PINs do not match')
    if (!password) return toast.error('Enter your account password to confirm')
    setBusy(true)
    try {
      const res = await fetch('/api/user/ai-pin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'Failed to save PIN')
      toast.success(hasPin ? 'PIN updated. The assistant has been re-locked.' : 'PIN protection enabled')
      notify()
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to save PIN')
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async () => {
    if (!password) return toast.error('Enter your account password to confirm')
    setBusy(true)
    try {
      const res = await fetch('/api/user/ai-pin', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'Failed to remove PIN')
      toast.success('PIN protection removed')
      notify()
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to remove PIN')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary" /> AI Assistant PIN</DialogTitle>
          <DialogDescription>
            Add a second layer of protection so only you can use the AI Assistant, even if your session is left open on a shared screen.
            {hasPin === true && <span className="block mt-1 text-primary">PIN protection is currently ON.</span>}
            {hasPin === false && <span className="block mt-1 text-muted-foreground">PIN protection is currently OFF.</span>}
          </DialogDescription>
        </DialogHeader>

        {hasPin && (
          <div className="flex gap-1 p-1 rounded-lg bg-white/5 text-xs">
            <button onClick={() => setMode('set')} className={`flex-1 py-1.5 rounded-md ${mode === 'set' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>Change PIN</button>
            <button onClick={() => setMode('remove')} className={`flex-1 py-1.5 rounded-md ${mode === 'remove' ? 'bg-destructive text-white' : 'text-muted-foreground'}`}>Remove PIN</button>
          </div>
        )}

        <div className="space-y-3">
          {mode === 'set' && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">New PIN (4–8 digits)</Label>
                <Input type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} className="tracking-[0.4em]" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Confirm PIN</Label>
                <Input type="password" inputMode="numeric" autoComplete="off" value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 8))} className="tracking-[0.4em]" />
              </div>
            </>
          )}
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1"><Lock className="w-3 h-3" /> Account password (to confirm)</Label>
            <Input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          {mode === 'set' ? (
            <Button onClick={handleSave} disabled={busy} className="gap-2"><ShieldCheck className="w-4 h-4" /> {hasPin ? 'Update PIN' : 'Enable PIN'}</Button>
          ) : (
            <Button variant="destructive" onClick={handleRemove} disabled={busy} className="gap-2"><ShieldOff className="w-4 h-4" /> Remove PIN</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
