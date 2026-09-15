'use client'

import { useState, useCallback } from 'react'
import { MoreVertical, RefreshCw, Copy, Trash2, Edit3, X, Lock, Unlock, Sparkles, Upload, Settings2, Link2 } from 'lucide-react'
import { Input } from '@/components/ui/input'

const COLOR_MAP: Record<string, string> = {
  blue: '#3B82F6',
  green: '#10B981',
  orange: '#F59E0B',
  purple: '#6366F1',
  red: '#EF4444',
  teal: '#14B8A6',
}

export type LockState = {
  lockedByMe: boolean
  lockedByOther: boolean
  lockedByName?: string | null
  canOverride?: boolean
}

export function WidgetWrapper({
  title,
  colorScheme,
  onDelete,
  onRefresh,
  onDuplicate,
  onTitleChange,
  onEditWithAI,
  onToggleLock,
  onPublish,
  onSettings,
  accentOverride,
  mcpLink,
  mcpServerName,
  lock,
  focused,
  children,
  loading,
  error,
}: {
  title: string
  colorScheme?: string
  onSettings?: () => void
  accentOverride?: string
  mcpLink?: string
  mcpServerName?: string
  onDelete?: () => void
  onRefresh?: () => void
  onDuplicate?: () => void
  onTitleChange?: (t: string) => void
  onEditWithAI?: () => void
  onToggleLock?: () => void
  onPublish?: () => void
  lock?: LockState
  focused?: boolean
  children: React.ReactNode
  loading?: boolean
  error?: string | null
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(title)
  const accentColor = accentOverride || (COLOR_MAP[colorScheme ?? 'blue'] ?? '#6366F1')
  const readOnly = !!lock?.lockedByOther

  const handleTitleSave = useCallback(() => {
    setEditing(false)
    if (editTitle.trim() && onTitleChange) {
      onTitleChange(editTitle.trim())
    }
  }, [editTitle, onTitleChange])

  const item = (icon: React.ReactNode, label: string, onClick?: () => void, cls = 'text-foreground', disabled = false) => (
    <button
      onClick={() => { if (!disabled) { onClick?.(); setMenuOpen(false) } }}
      disabled={disabled}
      className={`flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-white/5 w-full text-left ${cls} disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {icon} {label}
    </button>
  )

  return (
    <div
      className={`widget-shell relative h-full flex flex-col rounded-xl border bg-card/80 backdrop-blur-sm overflow-hidden group transition-shadow ${
        focused ? 'border-amber-400/70 shadow-[0_0_0_2px_rgba(251,191,36,0.35)]' : readOnly ? 'border-white/5' : 'border-white/10'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 min-h-[40px] flex-shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: accentColor }} />
          {editing ? (
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={(e) => e.key === 'Enter' && handleTitleSave()}
              className="h-6 text-xs py-0 px-1"
              autoFocus
              onMouseDown={e => e.stopPropagation()}
            />
          ) : (
            <span className="text-xs font-medium text-foreground/90 truncate">{title}</span>
          )}
          {(lock?.lockedByMe || lock?.lockedByOther) && (
            <span
              title={lock.lockedByMe ? 'Locked by you' : `Locked by ${lock.lockedByName ?? 'another user'}`}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] flex-shrink-0 ${
                lock.lockedByMe ? 'bg-primary/15 text-primary' : 'bg-amber-500/15 text-amber-300'
              }`}
            >
              <Lock className="w-2.5 h-2.5" />
              {lock.lockedByMe ? 'You' : (lock.lockedByName ?? 'Locked')}
            </span>
          )}
        </div>
        <div className="relative flex-shrink-0 flex items-center gap-0.5">
          {mcpLink && (
            <a
              href={mcpLink}
              target="_blank"
              rel="noopener noreferrer"
              onMouseDown={e => e.stopPropagation()}
              title={mcpServerName ? `Open MCP: ${mcpServerName}` : 'Open linked MCP server'}
              className="p-1 rounded hover:bg-white/10 text-teal-300/80 hover:text-teal-200 transition-colors"
            >
              <Link2 className="w-3.5 h-3.5" />
            </a>
          )}
          {!readOnly && onSettings && (
            <button
              onClick={onSettings}
              onMouseDown={e => e.stopPropagation()}
              title="Widget settings"
              className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          )}
          {!readOnly && onEditWithAI && (
            <button
              onClick={onEditWithAI}
              onMouseDown={e => e.stopPropagation()}
              title="Edit with AI"
              className={`p-1 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors ${focused ? 'opacity-100 text-amber-300' : 'opacity-0 group-hover:opacity-100'}`}
            >
              <Sparkles className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            onMouseDown={e => e.stopPropagation()}
            className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} onMouseDown={e => e.stopPropagation()} />
              <div className="absolute right-0 top-8 z-50 bg-card border border-white/10 rounded-lg shadow-lg py-1 min-w-[170px]" onMouseDown={e => e.stopPropagation()}>
                {item(<RefreshCw className="w-3 h-3" />, 'Refresh', onRefresh)}
                {!readOnly && onEditWithAI && item(<Sparkles className="w-3 h-3" />, 'Edit with AI', onEditWithAI, 'text-primary')}
                {onSettings && item(<Settings2 className="w-3 h-3" />, 'Widget settings', onSettings, 'text-foreground', readOnly)}
                {item(<Copy className="w-3 h-3" />, 'Duplicate', onDuplicate)}
                {item(<Edit3 className="w-3 h-3" />, 'Edit Title', () => setEditing(true), 'text-foreground', readOnly)}
                {onToggleLock && (
                  lock?.lockedByOther
                    ? item(<Unlock className="w-3 h-3" />, lock.canOverride ? 'Unlock (owner override)' : `Locked by ${lock.lockedByName ?? 'other'}`, onToggleLock, 'text-amber-300', !lock.canOverride)
                    : item(lock?.lockedByMe ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />, lock?.lockedByMe ? 'Unlock widget' : 'Lock widget', onToggleLock)
                )}
                {onPublish && item(<Upload className="w-3 h-3" />, 'Publish to Library', onPublish)}
                <div className="my-1 border-t border-white/5" />
                {item(<Trash2 className="w-3 h-3" />, 'Delete', onDelete, 'text-destructive', readOnly)}
              </div>
            </>
          )}
        </div>
      </div>
      {/* Body */}
      <div className="flex-1 p-3 overflow-hidden">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <span className="text-xs text-muted-foreground">Loading...</span>
            </div>
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <X className="w-6 h-6 text-destructive mx-auto mb-1" />
              <p className="text-xs text-destructive">{error}</p>
            </div>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}
