'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Bot, User, Sparkles, ChevronDown, ChevronRight, Lock, Unlock, Pencil, X, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Message = {
  role: 'user' | 'assistant'
  content: string
  widgetConfig?: any
}

export type FocusedWidget = {
  id: string
  title: string
  widgetConfig: any
}

const EXAMPLE_PROMPTS: Record<string, string[]> = {
  'Fleet Management': [
    'Show active vehicles on map',
    'Display driver performance scores table',
    'Fleet utilization rate this week',
    'Vehicle breakdown alerts today',
    'Top 5 routes by distance',
  ],
  'TMS (Transport)': [
    'Shipment delivery status by region',
    'On-time delivery rate this month',
    'Pending vs completed orders chart',
    'Average delivery time trend',
    'Freight cost by carrier',
  ],
  'ADAS': [
    'Show ADAS alert summary today',
    'Harsh braking events this week',
    'Lane departure warnings by driver',
    'Collision risk score distribution',
    'Safety score trend last 30 days',
  ],
  'Fuel Sensing': [
    'Fuel consumption trend last 7 days',
    'Fuel efficiency by vehicle type',
    'Fuel theft detection alerts',
    'Top 10 highest fuel consumers',
    'Idle time vs fuel waste chart',
  ],
  'EV Monitoring': [
    'Battery status across all EVs',
    'Charging session history',
    'State of charge distribution',
    'Range anxiety alerts map',
    'Energy consumption vs distance',
  ],
  'Weather (Live)': [
    'Current weather at Mumbai depot',
    'Weather forecast for Delhi route',
    'Temperature trend this week London',
  ],
}

const EDIT_PROMPTS = [
  'Change it to a bar chart',
  'Make it a pie chart',
  'Use green color scheme',
  'Show last 30 days instead',
  'Make it wider',
  'Rename to Weekly Summary',
]

export function AIAssistant({
  onWidgetCreate,
  onWidgetUpdate,
  focusedWidget,
  onClearFocus,
  onClose,
  onOpenPinSettings,
}: {
  onWidgetCreate: (config: any) => void
  onWidgetUpdate?: (widgetId: string, config: any) => Promise<boolean> | boolean | void
  focusedWidget?: FocusedWidget | null
  onClearFocus?: () => void
  onClose?: () => void
  onOpenPinSettings?: () => void
}) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hi! I'm your FleetAI assistant. Describe what data you'd like to see and I'll create a widget for your dashboard. Try the example prompts below, or pick 'Edit with AI' on any widget to change it." },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [showExamples, setShowExamples] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // PIN protection state
  const [pinStatus, setPinStatus] = useState<{ hasPin: boolean; unlocked: boolean } | null>(null)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [pinBusy, setPinBusy] = useState(false)

  const refreshPinStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/user/ai-pin')
      if (res.ok) setPinStatus(await res.json())
      else setPinStatus({ hasPin: false, unlocked: true })
    } catch {
      setPinStatus({ hasPin: false, unlocked: true })
    }
  }, [])

  useEffect(() => { refreshPinStatus() }, [refreshPinStatus])

  // Allow other components (settings dialog) to tell us the PIN changed
  useEffect(() => {
    const handler = () => refreshPinStatus()
    window.addEventListener('fleetai:pin-changed', handler)
    return () => window.removeEventListener('fleetai:pin-changed', handler)
  }, [refreshPinStatus])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  const focusedId = focusedWidget?.id
  const focusedTitleRef = useRef<string | undefined>(undefined)
  focusedTitleRef.current = focusedWidget?.title
  useEffect(() => {
    if (focusedId) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Now editing "${focusedTitleRef.current ?? 'widget'}". Tell me what to change — chart type, colors, time range, title or size.`,
      }])
      inputRef.current?.focus()
    }
  }, [focusedId])

  const handleUnlock = async () => {
    if (!pinInput || pinBusy) return
    setPinBusy(true)
    setPinError(null)
    try {
      const res = await fetch('/api/user/ai-pin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'Incorrect PIN')
      setPinInput('')
      setPinStatus(prev => ({ hasPin: prev?.hasPin ?? true, unlocked: true }))
    } catch (err: any) {
      setPinError(err?.message ?? 'Incorrect PIN')
    } finally {
      setPinBusy(false)
    }
  }

  const handleLock = async () => {
    await fetch('/api/user/ai-pin/verify', { method: 'DELETE' }).catch(() => {})
    setPinStatus(prev => ({ hasPin: prev?.hasPin ?? true, unlocked: false }))
  }

  const handleSend = async (prompt?: string) => {
    const text = (prompt ?? input).trim()
    if (!text || loading) return
    setInput('')

    const userMsg: Message = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)
    const editing = focusedWidget

    try {
      const response = await fetch('/api/ai/generate-widget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          editing
            ? { prompt: text, mode: 'edit', currentWidget: editing.widgetConfig }
            : { prompt: text }
        ),
      })

      if (response.status === 403) {
        const data = await response.json().catch(() => ({}))
        if (data?.pinRequired) {
          setPinStatus({ hasPin: true, unlocked: false })
          setMessages(prev => [...prev, { role: 'assistant', content: 'The assistant is locked. Please enter your PIN to continue.' }])
          return
        }
      }
      if (response.status === 429) {
        const data = await response.json().catch(() => ({}))
        if (data?.quotaExceeded) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `You have used your AI token allowance for this month (${Number(data?.quota?.used ?? 0).toLocaleString('en-US')} / ${Number(data?.quota?.limit ?? 0).toLocaleString('en-US')} tokens). Open "AI usage & credits" from your avatar menu to request more credits.`,
          }])
          window.dispatchEvent(new Event('fleetai:open-usage'))
          return
        }
      }
      if (!response.ok) {
        throw new Error('Failed to generate widget')
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response stream')

      const decoder = new TextDecoder()
      let partialRead = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        partialRead += decoder.decode(value, { stream: true })
        const lines = partialRead.split('\n')
        partialRead = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            try {
              const parsed = JSON.parse(data)
              if (parsed?.status === 'completed' && parsed?.widget) {
                const widget = parsed.widget
                if (editing && onWidgetUpdate) {
                  const merged = { ...editing.widgetConfig, ...widget }
                  const ok = await onWidgetUpdate(editing.id, merged)
                  setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: ok === false
                      ? `I couldn't update "${editing.title}" — it may be locked by another user.`
                      : `Updated "${merged?.title ?? editing.title}" → now a **${(merged?.type ?? 'widget').replace(/_/g, ' ')}**. Keep going, or press ✕ on the editing badge to finish.`,
                    widgetConfig: merged,
                  }])
                } else {
                  onWidgetCreate(widget)
                  setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `Created a **${(widget?.type ?? 'widget').replace(/_/g, ' ')}** widget: "${widget?.title ?? 'Untitled'}"`,
                    widgetConfig: widget,
                  }])
                }
              } else if (parsed?.status === 'error') {
                setMessages(prev => [...prev, {
                  role: 'assistant',
                  content: `Sorry, I couldn't do that. ${parsed?.message ?? 'Please try rephrasing your request.'}`,
                }])
              }
            } catch {
              // skip
            }
          }
        }
      }
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Something went wrong: ${err?.message ?? 'Unknown error'}. Please try again.`,
      }])
    } finally {
      setLoading(false)
    }
  }

  const locked = !!pinStatus?.hasPin && !pinStatus?.unlocked

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 bg-gradient-to-r from-primary/15 to-transparent">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground">AI Assistant</h3>
            <p className="text-[10px] text-muted-foreground">Describe widgets in natural language</p>
          </div>
          {pinStatus?.hasPin && !locked && (
            <button onClick={handleLock} title="Lock assistant" className="p-1.5 rounded-md hover:bg-white/10 text-muted-foreground hover:text-foreground">
              <Unlock className="w-3.5 h-3.5" />
            </button>
          )}
          {onOpenPinSettings && (
            <button onClick={onOpenPinSettings} title="PIN protection settings" className="p-1.5 rounded-md hover:bg-white/10 text-muted-foreground hover:text-foreground">
              <ShieldCheck className="w-3.5 h-3.5" />
            </button>
          )}
          {onClose && (
            <button onClick={onClose} title="Close" className="p-1.5 rounded-md hover:bg-white/10 text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {locked ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground">Assistant Locked</h4>
            <p className="text-xs text-muted-foreground mt-1">Enter your AI Assistant PIN to continue.</p>
          </div>
          <div className="w-full max-w-[220px] space-y-2">
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              placeholder="••••"
              value={pinInput}
              onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 8))}
              onKeyDown={e => e.key === 'Enter' && handleUnlock()}
              className="text-center tracking-[0.5em] text-lg h-11 bg-white/5 border-white/10"
              autoFocus
            />
            {pinError && <p className="text-xs text-destructive">{pinError}</p>}
            <Button onClick={handleUnlock} disabled={!pinInput || pinBusy} className="w-full gap-2">
              <Unlock className="w-4 h-4" /> Unlock
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="w-3 h-3 text-primary" />
                  </div>
                )}
                <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-white/5 text-foreground/90'
                }`}>
                  {msg.content}
                </div>
                {msg.role === 'user' && (
                  <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User className="w-3 h-3 text-foreground" />
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-3 h-3 text-primary" />
                </div>
                <div className="bg-white/5 px-3 py-2 rounded-xl">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Focused widget / Example Prompts */}
          {focusedWidget ? (
            <div className="px-3 py-2 border-t border-white/5">
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-amber-500/15 dark:bg-amber-500/10 border border-amber-500/40 dark:border-amber-500/30">
                <Pencil className="w-3 h-3 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <span className="text-[11px] font-medium text-amber-700 dark:text-amber-200 truncate flex-1">Editing: <b>{focusedWidget.title}</b></span>
                <button onClick={onClearFocus} className="p-0.5 rounded hover:bg-amber-500/20 dark:hover:bg-white/10 text-amber-700 dark:text-amber-300" title="Stop editing">
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1 pt-2">
                {EDIT_PROMPTS.map((p, j) => (
                  <button
                    key={j}
                    onClick={() => handleSend(p)}
                    disabled={loading}
                    className="px-2 py-1 text-[10px] rounded-md bg-white/5 hover:bg-primary/20 hover:text-primary text-foreground/70 transition-colors whitespace-nowrap"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="border-t border-white/5">
              <button
                onClick={() => setShowExamples(s => !s)}
                className="w-full flex items-center justify-between px-3 py-2 text-[10px] text-muted-foreground uppercase tracking-wider font-medium hover:text-foreground"
              >
                Example Prompts
                {showExamples ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>
              {showExamples && (
                <div className="px-3 pb-2 max-h-[180px] overflow-y-auto space-y-0.5">
                  {Object.entries(EXAMPLE_PROMPTS).map(([group, prompts]) => (
                    <div key={group}>
                      <button
                        onClick={() => setExpandedGroup(expandedGroup === group ? null : group)}
                        className="flex items-center gap-1 text-xs text-foreground/70 hover:text-foreground py-1 w-full text-left"
                      >
                        {expandedGroup === group ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        {group}
                      </button>
                      {expandedGroup === group && (
                        <div className="flex flex-wrap gap-1 pb-1.5 pl-4">
                          {prompts.map((p, j) => (
                            <button
                              key={j}
                              onClick={() => handleSend(p)}
                              disabled={loading}
                              className="px-2 py-1 text-[10px] rounded-md bg-white/5 hover:bg-primary/20 hover:text-primary text-foreground/70 transition-colors whitespace-nowrap"
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Input */}
          <div className="px-3 py-3 border-t border-white/5">
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder={focusedWidget ? `Change "${focusedWidget.title}"...` : 'Describe a widget...'}
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                rows={2}
                disabled={loading}
              />
              <Button
                size="icon"
                onClick={() => handleSend()}
                disabled={!input.trim() || loading}
                className="h-auto self-end"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
