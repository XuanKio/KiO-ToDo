import { useMemo, useState } from 'react'
import { ArrowUpRight, Check, Circle, CircleDashed, Copy, Folder, GripVertical, ListTodo, Pause, Play, RotateCcw, Search, Timer, X } from 'lucide-react'
import { useApp } from '../../app/store'
import { dateLabel, duration, priorityLabels, statusLabels } from '../../shared/model'
import type { Snapshot, Task, TaskStatus } from '../../shared/model'
import { IconButton } from '../../shared/ui'
import { actualAt, getActiveSession, ProjectDot, useTimerActions } from '../timer/Focus'

const icons = { todo: Circle, in_progress: CircleDashed, paused: Pause, completed: Check }

export function Status({ status }: { status: TaskStatus }) {
  const Icon = icons[status]
  return <span className={`status-pill ${status}`}><Icon size={13} /> {statusLabels[status]}</span>
}

export function TaskList({ tasks, snapshot, now, projectId, onProject, onEdit, onTime, onNew }: {
  tasks: Task[]
  snapshot: Snapshot
  now: number
  projectId: number | null
  onProject: (id: number | null) => void
  onEdit: (task: Task) => void
  onTime: (task: Task) => void
  onNew: () => void
}) {
  const [query, setQuery] = useState('')
  const [dragging, setDragging] = useState<number | null>(null)
  const [target, setTarget] = useState<number | null>(null)
  const mutate = useApp((state) => state.mutate)
  const busy = useApp((state) => state.busy)
  const { toggle, complete } = useTimerActions()
  const activeSession = useMemo(() => getActiveSession(snapshot), [snapshot])
  const needle = query.trim().toLowerCase()
  const filtered = tasks.filter((task) => {
    if (projectId !== null && task.projectId !== projectId) return false
    const project = snapshot.projects.find((item) => item.id === task.projectId)
    return [task.name, task.category, project?.name ?? '', ...task.tags].some((value) => value.toLowerCase().includes(needle))
  })

  async function reorder(targetId: number) {
    if (dragging === null || dragging === targetId) return
    const ids = filtered.map((item) => item.id)
    const destination = ids.indexOf(targetId)
    const from = ids.indexOf(dragging)
    if (from < 0 || destination < 0) return
    ids.splice(from, 1)
    ids.splice(destination, 0, dragging)
    setDragging(null)
    setTarget(null)
    await mutate('reorder_tasks', { ids })
  }

  return (
    <section className="tasks-card" aria-label="Task list">
      <header className="tasks-header">
        <div><h2>Task queue</h2><span className="count-chip">{filtered.length}</span></div>
        <div className="task-filters">
          {!!snapshot.projects.length && <label className="project-filter"><Folder size={14} /><select value={projectId ?? ''} onChange={(event) => onProject(event.target.value ? Number(event.target.value) : null)} aria-label="Filter by project">
            <option value="">All projects</option>
            {snapshot.projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>}
          <label className="search-box">
            <Search size={16} />
            <input aria-label="Search tasks" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks…" />
            {query && <IconButton className="small-icon" label="Clear search" onClick={() => setQuery('')}><X size={14} /></IconButton>}
          </label>
        </div>
      </header>
      {filtered.length ? <div className="task-table-wrap"><table className="task-table">
        <thead><tr><th scope="col"><span className="sr-only">Reorder</span></th><th scope="col">Task</th><th scope="col">Status</th><th scope="col">Estimate</th><th scope="col">Actual</th><th scope="col" className="due-column">Due</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{filtered.map((task) => {
          const project = snapshot.projects.find((item) => item.id === task.projectId)
          const elapsed = actualAt(task, activeSession, now)
          return <tr key={task.id}
            className={`${task.status === 'in_progress' ? 'running-row' : ''} ${target === task.id && dragging !== task.id ? 'drop-target' : ''}`}
            onDragOver={(event) => {
              if (dragging === null) return
              event.preventDefault()
              setTarget(task.id)
            }}
            onDrop={(event) => { event.preventDefault(); void reorder(task.id) }}>
            <td className="grip-cell">
              <span title="Drag to reorder" className="drag-grip" draggable={!busy} onDragStart={(event) => {
                setDragging(task.id)
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', String(task.id))
                event.dataTransfer.setDragImage(event.currentTarget.closest('tr') ?? event.currentTarget, 20, 22)
              }} onDragEnd={() => { setDragging(null); setTarget(null) }}><GripVertical size={17} /></span>
            </td>
            <td className="task-name-cell">
              <button type="button" className="task-name" onClick={() => onEdit(task)} title={`Edit ${task.name}`}><span>{task.name}</span><ArrowUpRight size={13} /></button>
              <div className="task-meta"><ProjectDot project={project} /><span>{project?.name ?? 'Unassigned'}</span><span className={`priority ${task.priority}`}>{priorityLabels[task.priority]}</span>{task.category && <span className="task-category">{task.category}</span>}</div>
            </td>
            <td><Status status={task.status} /></td>
            <td className="numeric estimated">{task.estimateSeconds ? duration(task.estimateSeconds * 1000) : '—'}</td>
            <td className={`numeric ${task.estimateSeconds > 0 && elapsed > task.estimateSeconds * 1000 ? 'over-time' : ''}`}>{elapsed ? duration(elapsed) : '—'}</td>
            <td className="due-column">{task.dueDate ? dateLabel(task.dueDate) : '—'}</td>
            <td><div className="row-actions">
              <IconButton label="Edit recorded time" disabled={busy} onClick={() => onTime(task)}><Timer size={15} /></IconButton>
              <IconButton label="Duplicate task" disabled={busy} onClick={() => void mutate('duplicate_task', { id: task.id })}><Copy size={15} /></IconButton>
              {task.status !== 'completed' && <IconButton label="Complete task" disabled={busy} onClick={() => void complete(task)}><Check size={16} /></IconButton>}
              {task.status === 'completed' ? <IconButton label="Reopen task" disabled={busy} onClick={() => void mutate('reopen_task', { id: task.id })}><RotateCcw size={15} /></IconButton> : <IconButton label={task.status === 'in_progress' ? 'Pause task' : task.status === 'paused' ? 'Resume task' : 'Start task'} className="row-play" disabled={busy} onClick={() => void toggle(task)}>
                {task.status === 'in_progress' ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
              </IconButton>}
            </div></td>
          </tr>
        })}</tbody>
      </table></div> : <div className="empty-tasks">
        <div className="empty-symbol"><ListTodo size={25} /></div>
        <h3>{needle ? 'No matching tasks' : snapshot.tasks.length ? 'No tasks in this view' : 'Your queue is empty'}</h3>
        <p>{needle ? 'Try a different name, project or tag.' : 'Add a task to start tracking your work.'}</p>
        {!needle && <button type="button" className="text-button" onClick={onNew}>Create a task <ArrowUpRight size={14} /></button>}
      </div>}
    </section>
  )
}
