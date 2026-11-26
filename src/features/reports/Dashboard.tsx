import { useMemo } from 'react'
import { CalendarDays, ChartNoAxesColumn, CheckCircle2, Clock3, Folder, Tag } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { duration } from '../../shared/model'
import type { Snapshot } from '../../shared/model'
import { getActiveSession, Progress } from '../timer/Focus'
import { closedWeek, rangeStart, sessionOverlap } from './report'
import { useReport } from './useReport'

function Metric({ label, value, icon: Icon }: { label: string; value: string | number; icon: LucideIcon }) {
  return <div className="panel dashboard-metric"><p><Icon size={16} /> {label}</p><strong>{value}</strong></div>
}

export function Dashboard({ snapshot, now }: { snapshot: Snapshot; now: number }) {
  const today = useReport(snapshot, 'today', now)
  const week = useReport(snapshot, 'week', now)
  const start = rangeStart('week', now)
  const days = useMemo(() => closedWeek(snapshot.sessions, start), [snapshot.sessions, start])
  const active = useMemo(() => getActiveSession(snapshot), [snapshot])
  const bars = days.map((day) => ({ ...day, actual: day.actual + (active ? sessionOverlap(active, day.date, Math.min(now, day.end)) : 0) }))
  const top = Math.max(...bars.map((day) => day.actual), 60_000)
  const names = new Intl.DateTimeFormat(undefined, { weekday: 'short' })

  return <div className="dashboard">
    <div className="dashboard-metrics">
      <Metric label="Tracked today" value={duration(today.actual)} icon={Clock3} />
      <Metric label="Tracked this week" value={duration(week.actual)} icon={CalendarDays} />
      <Metric label="Completed this week" value={week.completed} icon={CheckCircle2} />
    </div>
    <div className="report-grid">
      <section className="panel report-panel">
        <h2><ChartNoAxesColumn size={17} /> Daily activity</h2>
        <div className="weekly-bars" aria-label="Tracked time for each day this week">
          {bars.map((day) => {
            const label = names.format(day.date)
            return <div key={day.date} className="weekly-bar" title={`${label}: ${duration(day.actual)}`}>
              <div className="weekly-track"><span style={{ height: `${day.actual ? Math.max(3, day.actual / top * 100) : 0}%` }} /></div>
              <small>{label}</small>
              <span className="sr-only">{duration(day.actual)}</span>
            </div>
          })}
        </div>
      </section>
      <section className="panel report-panel">
        <h2><Clock3 size={17} /> Estimate vs actual</h2>
        <p className="hint">Tasks you worked on or completed this week</p>
        <Progress elapsed={week.actual} estimate={week.estimate} />
        <p className="estimate-detail"><strong>{week.tasks.length}</strong> {week.tasks.length === 1 ? 'task' : 'tasks'}</p>
      </section>
    </div>
    <div className="report-grid">
      <Distribution title="Time by project" groups={week.byProject} total={week.actual} icon={Folder} />
      <Distribution title="Time by category" groups={week.byCategory} total={week.actual} icon={Tag} />
    </div>
  </div>
}

export function Distribution({ title, groups, total, icon: Icon }: { title: string; groups: { label: string; actual: number }[]; total: number; icon: LucideIcon }) {
  return <section className="panel report-panel">
    <h2><Icon size={17} /> {title}</h2>
    {groups.length ? <ul className="distribution-list">
      {groups.map(({ label, actual }, index) => <li key={index}>
        <div><span title={label}>{label}</span><strong>{duration(actual)}</strong></div>
        <div className="distribution-meter"><span style={{ width: `${actual / total * 100}%` }} /></div>
      </li>)}
    </ul> : <p className="hint">No recorded time for this period.</p>}
  </section>
}
