import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, History as HistoryIcon, Pencil } from 'lucide-react'
import { clock } from '../../shared/model'
import type { Snapshot } from '../../shared/model'
import { IconButton } from '../../shared/ui'
import { rangeStart } from './report'
import type { ReportRange } from './report'
import { RangeSelect } from './Statistics'

const pageSize = 25

export function History({ snapshot, now, onEdit }: { snapshot: Snapshot; now: number; onEdit: (taskId: number) => void }) {
  const [range, setRange] = useState<ReportRange>('all')
  const [page, setPage] = useState(0)
  const start = rangeStart(range, now)
  const sessions = useMemo(() => snapshot.sessions.filter((session) => session.endedAt === null || session.endedAt >= start), [snapshot.sessions, start])
  const tasks = useMemo(() => new Map(snapshot.tasks.map((task) => [task.id, task])), [snapshot.tasks])
  const projects = useMemo(() => new Map(snapshot.projects.map((project) => [project.id, project.name])), [snapshot.projects])
  const currentPage = Math.min(page, Math.max(0, Math.ceil(sessions.length / pageSize) - 1))
  const visible = sessions.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
  const time = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  return <div className="dashboard">
    <div className="report-toolbar">
      <span className="hint">{sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}</span>
      <RangeSelect value={range} onChange={(next) => { setRange(next); setPage(0) }} />
    </div>
    {visible.length ? <section className="panel task-table-wrap" aria-label="Work sessions">
      <table className="task-table report-table">
        <thead><tr><th scope="col">Task</th><th scope="col">Started</th><th scope="col">Ended</th><th scope="col">Duration</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{visible.map((session) => {
          const task = tasks.get(session.taskId)
          const project = task?.projectId != null ? projects.get(task.projectId) : undefined
          return <tr key={session.id}>
            <td className="table-task">
              <strong title={task?.name}>{task?.name ?? 'Task unavailable'}</strong>
              <small>{project ?? 'Unassigned'}</small>
            </td>
            <td>{time.format(session.startedAt)}</td>
            <td>{session.endedAt === null ? <span className="history-running">Running</span> : time.format(session.endedAt)}</td>
            <td>{clock((session.endedAt ?? now) - session.startedAt)}</td>
            <td>{session.endedAt !== null && <IconButton label="Edit task sessions" onClick={() => onEdit(session.taskId)}><Pencil size={15} /></IconButton>}</td>
          </tr>
        })}</tbody>
      </table>
      {sessions.length > pageSize && <footer className="history-pagination">
        <span>{currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, sessions.length)} of {sessions.length}</span>
        <IconButton label="Previous sessions" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={17} /></IconButton>
        <IconButton label="More sessions" disabled={(currentPage + 1) * pageSize >= sessions.length} onClick={() => setPage(currentPage + 1)}><ChevronRight size={17} /></IconButton>
      </footer>}
    </section> : <section className="empty-tasks panel">
      <div className="empty-symbol"><HistoryIcon size={23} /></div>
      <h3>No sessions in this period</h3>
      <p>Start a task timer to record a work session.</p>
    </section>}
  </div>
}
