'use client'

import { useEffect, useLayoutEffect, useState, useCallback } from 'react'
import { AIAssistant, type FocusedWidget } from './ai-assistant'

const PANEL_W = 380
const GAP = 12

type Pos = { left: number; top: number; height: number }

function computePosition(rect: DOMRect | null): Pos {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const height = Math.min(520, vh - 32)

  // Small screens: dock to bottom center-ish, full-ish width
  if (vw < 640) {
    return { left: 8, top: Math.max(8, vh - height - 8), height }
  }

  if (!rect) {
    return { left: vw - PANEL_W - 16, top: 80, height }
  }

  // Prefer right of the widget, then left, then clamp
  let left = rect.right + GAP
  if (left + PANEL_W > vw - 8) {
    left = rect.left - PANEL_W - GAP
  }
  if (left < 8) {
    left = Math.min(Math.max(8, rect.left), vw - PANEL_W - 8)
  }
  left = Math.min(Math.max(8, left), vw - PANEL_W - 8)

  // Align top with the widget, clamped into viewport
  let top = rect.top
  top = Math.min(Math.max(8, top), vh - height - 8)

  return { left, top, height }
}

export function WidgetEditChat({
  focusedWidget,
  onWidgetCreate,
  onWidgetUpdate,
  onClose,
}: {
  focusedWidget: FocusedWidget
  onWidgetCreate: (config: any) => void
  onWidgetUpdate: (widgetId: string, config: any) => Promise<boolean>
  onClose: () => void
}) {
  const widgetId = focusedWidget.id
  const [pos, setPos] = useState<Pos>(() => computePosition(null))

  const recompute = useCallback(() => {
    const el = typeof document !== 'undefined'
      ? document.querySelector(`[data-widget-id="${widgetId}"]`)
      : null
    const rect = el ? el.getBoundingClientRect() : null
    setPos(computePosition(rect))
  }, [widgetId])

  useLayoutEffect(() => {
    recompute()
  }, [recompute])

  useEffect(() => {
    recompute()
    const onScroll = () => recompute()
    const onResize = () => recompute()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    // Follow layout shifts (drag/resize of grid) for a short while
    const id = window.setInterval(recompute, 500)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
      window.clearInterval(id)
    }
  }, [recompute])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed z-[80] w-[calc(100vw-1rem)] sm:w-[380px] rounded-2xl border border-amber-500/40 bg-card/95 backdrop-blur-xl shadow-2xl shadow-amber-500/20 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      style={{ left: pos.left, top: pos.top, height: pos.height }}
      role="dialog"
      aria-label="Edit widget with AI"
    >
      <AIAssistant
        onWidgetCreate={onWidgetCreate}
        onWidgetUpdate={onWidgetUpdate}
        focusedWidget={focusedWidget}
        onClearFocus={onClose}
        onClose={onClose}
      />
    </div>
  )
}
