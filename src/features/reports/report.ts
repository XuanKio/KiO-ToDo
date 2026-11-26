import type { Session, Snapshot, Task } from '../../shared/model'

export type ReportRange = 'today' | 'week' | 'all'
export type ReportFormat = 'csv' | 'markdown'

export const rangeLabels: Record<ReportRange, string> = { today: 'Today', week: 'This week', all: 'All time' }

export function rangeStart(range: ReportRange, now: number) {
  if (range === 'all') return 0
  const day = new Date(now)
  day.setHours(0, 0, 0, 0)
  if (range === 'week') day.setDate(day.getDate() - (day.getDay() + 6) % 7)
  return day.getTime()
}

export function sessionOverlap(session: Session, start: number, end: number) {
  return Math.max(0, Math.min(end, session.endedAt ?? end) - Math.max(start, session.startedAt))
}

export function closedTimeByTask(sessions: Session[], start: number) {
  const totals = new Map<number, number>()
  for (const session of sessions) {
    if (session.endedAt === null) continue
    const ms = sessionOverlap(session, start, session.endedAt)
    if (ms > 0) totals.set(session.taskId, (totals.get(session.taskId) ?? 0) + ms)
  }
  return totals
}

export interface ReportTask {
  task: Task
  project: string
  category: string
  actual: number
  estimate: number
}

interface Group {
  label: string
  actual: number
}

export interface Report {
  tasks: ReportTask[]
  actual: number
  estimate: number
  completed: number
  byProject: Group[]
  byCategory: Group[]
}

export function reportFrom(snapshot: Snapshot, start: number, now: number, closed: Map<number, number>, active?: Session): Report {
  const projects = new Map(snapshot.projects.map((project) => [project.id, project.name]))
  const byProject = new Map<number | null, Group>()
  const byCategory = new Map<string, Group>()
  const report: Report = { tasks: [], actual: 0, estimate: 0, completed: 0, byProject: [], byCategory: [] }
  const activeMs = active ? sessionOverlap(active, start, now) : 0

  for (const task of snapshot.tasks) {
    const actual = (closed.get(task.id) ?? 0) + (active?.taskId === task.id ? activeMs : 0)
    const completed = task.completedAt !== null && task.completedAt >= start && task.completedAt <= now
    if (start > 0 && !actual && !completed) continue

    const project = task.projectId === null ? 'Unassigned' : projects.get(task.projectId) ?? 'Unassigned'
    const category = task.category || 'Uncategorized'
    const estimate = task.estimateSeconds * 1000
    report.tasks.push({ task, project, category, actual, estimate })
    report.actual += actual
    report.estimate += estimate
    report.completed += Number(completed)

    if (actual === 0) continue
    const projectTime = byProject.get(task.projectId) ?? { label: project, actual: 0 }
    const categoryTime = byCategory.get(task.category) ?? { label: category, actual: 0 }
    projectTime.actual += actual
    categoryTime.actual += actual
    byProject.set(task.projectId, projectTime)
    byCategory.set(task.category, categoryTime)
  }
  report.byProject = [...byProject.values()].sort((a, b) => b.actual - a.actual)
  report.byCategory = [...byCategory.values()].sort((a, b) => b.actual - a.actual)
  return report
}

type Day = { date: number; end: number; actual: number }

export function closedWeek(sessions: Session[], start: number): Day[] {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start)
    date.setDate(date.getDate() + index)
    const end = new Date(date)
    end.setDate(end.getDate() + 1)
    return { date: date.getTime(), end: end.getTime(), actual: 0 }
  })
  for (const session of sessions) {
    if (session.endedAt === null || session.endedAt <= start) continue
    for (const day of days) day.actual += sessionOverlap(session, day.date, day.end)
  }
  return days
}

function csvCell(value: string | number) {
  if (typeof value === 'number') return String(value)
  const text = /^[\s\u0000-\u001f]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value
  return `"${text.replaceAll('"', '""')}"`
}

function markdownCell(value: string) {
  return value.replace(/[\r\n]+/g, ' ').replace(/[\\|`*_[\]<>]/g, (character) => `\\${character}`)
}

const seconds = (ms: number) => Math.round(ms / 1000)
const human = (ms: number) => {
  const value = seconds(Math.abs(ms))
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor(value / 60) % 60
  return [hours ? `${hours}h` : '', minutes ? `${minutes}m` : '', value % 60 ? `${value % 60}s` : ''].filter(Boolean).join(' ') || '0s'
}

export function exportReport(format: ReportFormat, report: Report, range: ReportRange, date: string) {
  if (format === 'csv') {
    const rows = report.tasks.map(({ task, project, category, estimate, actual }) => [
      task.name, project, category, task.status, seconds(estimate), seconds(actual), seconds(actual - estimate),
    ].map(csvCell).join(','))
    return '\ufeff' + ['Task,Project,Category,Status,Estimate (seconds),Actual (seconds),Variance (seconds)', ...rows].join('\r\n') + '\r\n'
  }
  const variance = report.actual - report.estimate
  const rows = report.tasks.map(({ task, project, category, estimate, actual }) => {
    return `| ${[markdownCell(task.name), markdownCell(project), markdownCell(category), task.status.replaceAll('_', ' '), human(estimate), human(actual)].join(' | ')} |`
  })
  return [
    `# Dev Focus — ${rangeLabels[range]} (${date})`, '',
    `- Time tracked: ${human(report.actual)}`,
    `- Estimate: ${human(report.estimate)}`,
    `- Variance: ${variance > 0 ? '+' : variance < 0 ? '−' : ''}${human(variance)}`,
    `- Tasks completed: ${report.completed}`, '',
    '| Task | Project | Category | Status | Estimate | Actual |',
    '| --- | --- | --- | --- | ---: | ---: |',
    ...rows, '',
  ].join('\n')
}
