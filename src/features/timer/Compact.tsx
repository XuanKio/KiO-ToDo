import { GripHorizontal, Maximize2, Pause, Play } from 'lucide-react'
import { useApp } from '../../app/store'
import { clock } from '../../shared/model'
import type { DesktopState, Task } from '../../shared/model'
import { IconButton } from '../../shared/ui'
import { useTimerActions } from './Focus'

function compactClock(ms: number) {
  const digits = clock(ms)
  return ms >= 3_600_000 ? digits : digits.slice(3)
}

function displayTime(elapsed: number, estimate: number, countdown: boolean) {
  if (!countdown || !estimate) return compactClock(elapsed)
  return `${elapsed > estimate ? '+' : ''}${compactClock(Math.abs(estimate - elapsed))}`
}

export function Mini({ task, elapsed, desktop }: { task?: Task; elapsed: number; desktop: DesktopState }) {
  const perform = useApp((state) => state.windowAction)
  const busy = useApp((state) => state.busy)
  const { toggle } = useTimerActions()
  const running = task?.status === 'in_progress'
  const estimate = (task?.estimateSeconds ?? 0) * 1000

  return <div className="mini-bar">
    <div className="mini-draggable" data-tauri-drag-region>
      <span className={`mini-indicator ${running ? 'running' : ''}`} />
      <span className="mini-name" title={task?.name}>{task?.name ?? 'No current task'}</span>
      <strong className={`mini-time ${elapsed > estimate && estimate > 0 ? 'over' : ''}`}>{displayTime(elapsed, estimate, desktop.timerMode === 'countdown')}</strong>
    </div>
    <IconButton label={running ? 'Pause timer' : task?.status === 'paused' ? 'Resume timer' : 'Start timer'} disabled={busy || !task} onClick={() => { if (task) void toggle(task) }}>
      {running ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
    </IconButton>
    <IconButton label="Expand widget" onClick={() => void perform('set_mode', { mode: 'widget' })}><Maximize2 size={15} /></IconButton>
  </div>
}

export function Bubble({ task, elapsed, desktop }: { task?: Task; elapsed: number; desktop: DesktopState }) {
  const perform = useApp((state) => state.windowAction)
  const estimate = (task?.estimateSeconds ?? 0) * 1000
  const ratio = estimate ? elapsed / estimate : 0
  const tone = ratio > 1 ? 'over' : ratio >= .85 ? 'near' : 'on-track'
  const percent = Math.min(100, Math.floor(ratio * 100))
  return <div className={`bubble ${tone}`} style={{ background: `conic-gradient(var(--ring) ${percent}%, var(--border-strong) 0)` }}>
    <div className="bubble-inner">
      <div className="bubble-grip" title="Drag bubble" data-tauri-drag-region><GripHorizontal size={14} /></div>
      <button type="button" className="bubble-open" aria-label="Expand widget" title={task?.name ?? 'Open widget'} onClick={() => void perform('set_mode', { mode: 'widget' })}>
        {displayTime(elapsed, estimate, desktop.timerMode === 'countdown')}
      </button>
    </div>
  </div>
}
