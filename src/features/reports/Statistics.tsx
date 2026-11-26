import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { ArrowDownToLine, Folder, Gauge, Tag } from 'lucide-react'
import { useApp } from '../../app/store'
import { duration, localDate } from '../../shared/model'
import type { Snapshot } from '../../shared/model'
import { Status } from '../tasks/TaskList'
import { Progress } from '../timer/Focus'
import { Distribution } from './Dashboard'
import { exportReport, rangeLabels } from './report'
import type { ReportFormat, ReportRange } from './report'
import { useReport } from './useReport'

export function RangeSelect({ value, onChange }: { value: ReportRange; onChange: (range: ReportRange) => void }) {
  return <label className="report-range">
    <span className="sr-only">Report period</span>
    <select value={value} onChange={(event) => onChange(event.target.value as ReportRange)}>
      {Object.entries(rangeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select>
  </label>
}

export function Statistics({ snapshot, now }: { snapshot: Snapshot; now: number }) {
  const [range, setRange] = useState<ReportRange>('week')
  const [exporting, setExporting] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const showError = useApp((state) => state.showError)
  const clearError = useApp((state) => state.clearError)
  const report = useReport(snapshot, range, now)
  const variance = report.actual - report.estimate

  async function save(format: ReportFormat) {
    setExporting(true)
    setSaved(null)
    clearError()
    try {
      const date = localDate()
      const extension = format === 'csv' ? 'csv' : 'md'
      const fileName = `dev-focus-${range}-${date}.${extension}`
      const contents = exportReport(format, report, range, date)
      const path = await invoke<string | null>('save_report', { format, contents, fileName })
      if (path) setSaved(path)
    } catch (error) {
      showError(error)
    } finally {
      setExporting(false)
    }
  }

  return <div className="dashboard">
    <div className="report-toolbar">
      <RangeSelect value={range} onChange={(next) => { setRange(next); setSaved(null) }} />
      <div className="page-actions">
        <button className="button secondary" type="button" disabled={exporting} onClick={() => void save('csv')}><ArrowDownToLine size={15} /> CSV</button>
        <button className="button secondary" type="button" disabled={exporting} onClick={() => void save('markdown')}><ArrowDownToLine size={15} /> Markdown</button>
      </div>
    </div>
    {saved && <p className="export-success" role="status">Saved to {saved}</p>}
    <section className="panel report-panel">
      <h2><Gauge size={17} /> Estimate vs actual</h2>
      <Progress elapsed={report.actual} estimate={report.estimate} />
      <p className="estimate-detail">Variance <strong className={variance > 0 ? 'metric-over' : ''}>{variance > 0 ? '+' : variance < 0 ? '−' : ''}{duration(variance)}</strong><span /> {report.completed} completed</p>
    </section>
    <div className="report-grid">
      <Distribution title="Time by project" groups={report.byProject} total={report.actual} icon={Folder} />
      <Distribution title="Time by category" groups={report.byCategory} total={report.actual} icon={Tag} />
    </div>
    <section className="panel task-table-wrap" aria-label="Task statistics">
      <table className="task-table report-table">
        <thead><tr><th scope="col">Task</th><th scope="col">Project</th><th scope="col">Status</th><th scope="col">Estimate</th><th scope="col">Actual</th></tr></thead>
        <tbody>{report.tasks.map(({ task, project, estimate, actual }) => <tr key={task.id}>
          <td className="table-task" title={task.name}>{task.name}</td><td>{project}</td><td><Status status={task.status} /></td><td>{duration(estimate)}</td><td>{duration(actual)}</td>
        </tr>)}</tbody>
      </table>
      {!report.tasks.length && <p className="report-empty hint">No tracked or completed tasks for this period.</p>}
    </section>
  </div>
}
