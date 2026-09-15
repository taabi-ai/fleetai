'use client'

import { useEffect } from 'react'
import { Sparkles, X } from 'lucide-react'
import { AIAssistant, type FocusedWidget } from './ai-assistant'

export function FloatingAssistant({
  open,
  onOpenChange,
  onWidgetCreate,
  onWidgetUpdate,
  focusedWidget,
  onClearFocus,
  onOpenPinSettings,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onWidgetCreate: (config: any) => void
  onWidgetUpdate: (widgetId: string, config: any) => Promise<boolean>
  focusedWidget: FocusedWidget | null
  onClearFocus: () => void
  onOpenPinSettings: () => void
}) {
  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onOpenChange])

  return (
    <>
      {/* Backdrop — click anywhere outside to dismiss */}
      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/20 backdrop-blur-[1px] animate-in fade-in duration-200"
          onClick={() => onOpenChange(false)}
          aria-hidden
        />
      )}

      {/* Chat window */}
      <div
        className={`fixed z-[70] bottom-24 right-4 sm:right-6 w-[calc(100vw-2rem)] sm:w-[400px] h-[min(640px,calc(100vh-8rem))] rounded-2xl border border-white/10 bg-card/95 backdrop-blur-xl shadow-2xl shadow-primary/20 overflow-hidden origin-bottom-right transition-all duration-300 ease-out ${
          open ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto' : 'opacity-0 scale-90 translate-y-4 pointer-events-none'
        }`}
        role="dialog"
        aria-label="AI Assistant"
      >
        <AIAssistant
          onWidgetCreate={onWidgetCreate}
          onWidgetUpdate={onWidgetUpdate}
          focusedWidget={focusedWidget}
          onClearFocus={onClearFocus}
          onClose={() => onOpenChange(false)}
          onOpenPinSettings={onOpenPinSettings}
        />
      </div>

      {/* Launcher button */}
      <div className="fixed z-[70] bottom-6 right-4 sm:right-6">
        {!open && (
          <>
            <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping" style={{ animationDuration: '2.4s' }} />
            <span className="absolute -inset-1 rounded-full bg-gradient-to-tr from-primary/40 via-teal-400/30 to-fuchsia-500/30 blur-md ai-launcher-glow" />
          </>
        )}
        <button
          onClick={() => onOpenChange(!open)}
          aria-label={open ? 'Close AI Assistant' : 'Open AI Assistant'}
          className={`relative w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg shadow-primary/40 transition-all duration-300 active:scale-95 ${
            open ? 'bg-card border border-white/15 rotate-90' : 'bg-gradient-to-br from-primary via-orange-500 to-amber-400 ai-launcher hover:brightness-110'
          }`}
        >
          {open ? (
            <X className="w-6 h-6 text-foreground -rotate-90" />
          ) : (
            <Sparkles className="w-6 h-6 ai-launcher-icon" />
          )}
          {!open && focusedWidget && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-400 border-2 border-background" />
          )}
        </button>
        {!open && (
          <div className="absolute right-16 top-1/2 -translate-y-1/2 whitespace-nowrap px-3 py-1.5 rounded-full bg-card border border-white/10 text-xs text-foreground shadow-lg ai-launcher-hint">
            {focusedWidget ? `Editing “${focusedWidget.title}”` : 'Ask AI to build a widget'}
          </div>
        )}
      </div>
    </>
  )
}
