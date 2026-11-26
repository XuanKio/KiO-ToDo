import type { Snapshot } from '../../shared/model'
import { actualAt, getActiveSession } from '../timer/Focus'

export function summarizeProjects(snapshot: Snapshot, now: number) {
  const totals = new Map(snapshot.projects.map((p) => [p.id, { count: 0, completed: 0, estimate: 0, actual: 0, remaining: 0 }]))
  const activeSession = getActiveSession(snapshot)
  for (const task of snapshot.tasks) {
    if (task.projectId === null) continue
    const metrics = totals.get(task.projectId)
    if (!metrics) continue
    const estimate = task.estimateSeconds * 1000
    const actual = actualAt(task, activeSession, now)
    metrics.count += 1
    metrics.estimate += estimate
    metrics.actual += actual
    if (task.status === 'completed') metrics.completed += 1
    else metrics.remaining += Math.max(estimate - actual, 0)
  }
  return totals
}
