import { useMemo } from 'react'
import type { Snapshot } from '../../shared/model'
import { getActiveSession } from '../timer/Focus'
import { closedTimeByTask, rangeStart, reportFrom } from './report'
import type { ReportRange } from './report'

export function useReport(snapshot: Snapshot, range: ReportRange, now: number) {
  const start = rangeStart(range, now)
  const active = useMemo(() => getActiveSession(snapshot), [snapshot])
  const totals = useMemo(() => closedTimeByTask(snapshot.sessions, start), [snapshot.sessions, start])
  return useMemo(() => reportFrom(snapshot, start, now, totals, active), [snapshot, start, now, totals, active])
}
