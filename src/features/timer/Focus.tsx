import { useEffect, useMemo, useState } from 'react'
import { Activity, ArrowRight, Check, Circle, ListTodo, Pause, Play, SkipForward, Timer } from 'lucide-react'
import { useApp } from '../../app/store'
import { clock, duration, isToday, statusLabels } from '../../shared/model'
import type { Project, Session, Snapshot, Task, TimerMode } from '../../shared/model'
import { IconButton } from '../../shared/ui'

export function useNow(running: boolean) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    let tick: number | undefined
    const update = () => {
      window.clearTimeout(tick)
      if (document.hidden) return
      const time = Date.now()
      setNow(time)
      const midnight = new Date(time)
      midnight.setHours(24, 0, 0, 0)
      tick = window.setTimeout(update, running ? 750 : midnight.getTime() - time + 10)
    }
    update()
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.clearTimeout(tick)
      window.removeEventListener('focus', update)
      document.removeEventListener('visibilitychange', update)
    }
  }, [running])
  return now
}

export function getActiveSession(snapshot: Snapshot) {
  return snapshot.activeTaskId === null ? undefined : snapshot.sessions.find((session) => session.endedAt === null)
}

export function actualAt(task: Task, active: Session | undefined, now: number) {
  return task.actualMs + (active?.taskId === task.id ? Math.max(0, now - active.startedAt) : 0)
}

export function currentTask(snapshot: Snapshot, selectedId: number | null) {
  const taskById = (id: number | null) => snapshot.tasks.find((task) => task.id === id && task.status !== 'completed')
  return taskById(snapshot.activeTaskId) ?? taskById(selectedId)
    ?? snapshot.tasks.find((task) => task.status === 'paused')
    ?? snapshot.tasks.find((task) => task.status === 'todo')
}

export function useTimerActions() {
  const mutate = useApp((state) => state.mutate)
  const select = useApp((state) => state.select)
  return {
    toggle: async (task: Task) => {
      const command = task.status === 'in_progress' ? 'pause_task' : 'start_task'
      if (await mutate(command, { id: task.id })) select(task.id)
    },
    complete: (task: Task) => mutate('complete_task', { id: task.id }),
  }
}

export function Progress({ elapsed, estimate, compact = false }: { elapsed: number; estimate: number; compact?: boolean }) {
  const ratio = estimate ? elapsed / estimate : 0
  const tone = ratio > 1 ? 'over' : ratio >= 0.85 ? 'near' : 'on-track'
  return (
    <div className={`progress-group ${tone}`}>
      <div className="progress-label">
        <span>{estimate ? 'Estimate progress' : 'No estimate set'}</span>
        <strong>{ratio > 1 ? `+${clock(elapsed - estimate)} over` : estimate ? `${Math.floor(ratio * 100)}%` : '—'}</strong>
      </div>
      <div className="progress-meter" role="progressbar" aria-label="Estimate progress" aria-valuenow={Math.min(100, Math.floor(ratio * 100))}>
        <span style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
      {(!compact || estimate > 0) && <div className="progress-details">
        <span>{duration(elapsed)} tracked</span>
        <span>{estimate ? `${duration(estimate)} estimated` : 'Estimate optional'}</span>
      </div>}
    </div>
  )
}

interface FocusProps {
  task?: Task
  snapshot: Snapshot
  elapsed: number
  now: number
  compact?: boolean
  timerMode: TimerMode
  onTime?: () => void
  onNew?: () => void
}

export function Focus({ task, snapshot, elapsed, now, compact, timerMode, onTime, onNew }: FocusProps) {
  const { toggle, complete } = useTimerActions()
  const busy = useApp((state) => state.busy)
  const project = snapshot.projects.find((item) => item.id === task?.projectId)
  const estimate = (task?.estimateSeconds ?? 0) * 1000
  const countdown = timerMode === 'countdown' && estimate > 0
  const displayed = countdown ? Math.abs(estimate - elapsed) : elapsed
  const queue = snapshot.tasks.filter((item) => item.status !== 'completed')
  const taskIndex = queue.findIndex((item) => item.id === task?.id)
  const next = queue.length > 1 ? queue[(taskIndex + 1) % queue.length] : undefined
  const action = task?.status === 'in_progress' ? 'Pause' : task?.status === 'paused' ? 'Resume' : 'Start'
  const today = queue.filter((item) => isToday(item, now))
  const sessionCount = useMemo(() => task ? snapshot.sessions.filter((session) => session.taskId === task.id).length : 0, [snapshot.sessions, task])

  return (
    <section className={compact ? 'widget-focus' : 'focus-card'} aria-label="Focus timer">
      <div className="focus-main">
        <div className="section-kicker"><Activity size={15} /> Focus timer</div>
        <div className="focus-task">
          <div className="focus-project"><ProjectDot project={project} />{project?.name ?? (task ? 'Unassigned' : 'Ready when you are')}</div>
          <h2 title={task?.name}>{task?.name ?? 'Start a focus session'}</h2>
          {!compact && <p>{task ? statusLabels[task.status] : 'Create a task to track your time and compare it with your estimate.'}</p>}
        </div>
        <div className={`timer-digits ${task?.status === 'in_progress' ? 'is-running' : ''} ${countdown && elapsed > estimate ? 'is-over' : ''}`} aria-label={countdown ? 'Countdown' : 'Elapsed time'}>{countdown && elapsed > estimate ? '+' : ''}{clock(displayed)}</div>
        <div className="timer-buttons">
          {task ? <>
            <button type="button" className="button primary" disabled={busy} onClick={() => void toggle(task)}>
              {action === 'Pause' ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />} {action}
            </button>
            <button type="button" className="button secondary" disabled={busy} onClick={() => void complete(task)}><Check size={17} /> Complete</button>
            <IconButton className="boxed" label="Start next task" disabled={busy || !next} onClick={() => { if (next) void toggle(next) }}><SkipForward size={16} /></IconButton>
          </> : <button type="button" className="button primary" onClick={onNew}><ListTodo size={16} /> New task</button>}
        </div>
      </div>
      <div className="focus-aside">
        <Progress elapsed={elapsed} estimate={estimate} compact={compact} />
        {compact ? <div className="widget-today">
          <h3>Today <span>{today.length}</span></h3>
          <div className="widget-queue">
            {today.length ? today.map((item) => (
              <button key={item.id} className={`queue-item ${item.id === task?.id ? 'active' : ''}`} onClick={() => void toggle(item)} disabled={busy} type="button" title={item.status === 'in_progress' ? 'Pause task' : 'Start task'}>
                {item.id === task?.id ? <Activity size={13} /> : <Circle size={12} />}
                <span>{item.name}</span>
                {item.estimateSeconds > 0 && <small>{duration(item.estimateSeconds * 1000)}</small>}
              </button>
            )) : <p className="widget-empty">No tasks due today.</p>}
          </div>
        </div> : <div className="focus-notes">
          <div><span><Timer size={16} /> Work sessions</span><strong>{sessionCount}</strong></div>
          {task && onTime && <button type="button" className="text-button" onClick={onTime}>Edit recorded time <ArrowRight size={14} /></button>}
        </div>}
      </div>
    </section>
  )
}

export function ProjectDot({ project }: { project?: Project }) {
  return <span className="project-dot" style={project ? { backgroundColor: project.color } : undefined} />
}
