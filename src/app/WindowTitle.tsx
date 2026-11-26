import { CircleDot, Crosshair, LayoutGrid, Minimize2, Minus, PanelTop, Pin } from 'lucide-react'
import { IconButton } from '../shared/ui'
import { useApp } from './store'
import type { DesktopState } from '../shared/model'

export function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? 'brand-compact' : ''}`}>
    <span className="brand-mark"><Crosshair size={compact ? 14 : 19} strokeWidth={2.4} /></span>
    <strong>Dev Focus</strong>
  </div>
}

export function WindowTitle({ desktop }: { desktop: DesktopState }) {
  const perform = useApp((state) => state.windowAction)
  const full = desktop.mode === 'full'
  return <header className={`window-title ${full ? 'full-title' : ''}`} data-tauri-drag-region>
    <div className="title-draggable" data-tauri-drag-region>
      <Brand compact />
    </div>
    <div className="window-actions">
      {!full && <IconButton label={desktop.pinned ? 'Unpin widget' : 'Pin widget'} aria-pressed={desktop.pinned} onClick={() => void perform('set_pinned', { pinned: !desktop.pinned })}><Pin size={15} fill={desktop.pinned ? 'currentColor' : 'none'} /></IconButton>}
      {!full && <IconButton label="Open mini mode" onClick={() => void perform('set_mode', { mode: 'mini' })}><Minimize2 size={15} /></IconButton>}
      {!full && <IconButton label="Open floating bubble" onClick={() => void perform('set_mode', { mode: 'bubble' })}><CircleDot size={15} /></IconButton>}
      <IconButton label={full ? 'Open widget' : 'Open full window'} onClick={() => void perform('set_mode', { mode: full ? 'widget' : 'full' })}>{full ? <PanelTop size={16} /> : <LayoutGrid size={15} />}</IconButton>
      <IconButton label="Minimize to tray" onClick={() => void perform('hide_window')}><Minus size={17} /></IconButton>
    </div>
  </header>
}
