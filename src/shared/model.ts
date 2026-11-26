export type TaskStatus = 'todo' | 'in_progress' | 'paused' | 'completed'
export type Priority = 'low' | 'normal' | 'high' | 'urgent'
export type Mode = 'full' | 'widget' | 'mini' | 'bubble'
export type Theme = 'dark' | 'light'
export type TimerMode = 'stopwatch' | 'countdown'

export interface Subtask {
  id: number
  name: string
  completed: boolean
}

export interface Task {
  id: number
  name: string
  projectId: number | null
  description: string
  estimateSeconds: number
  priority: Priority
  status: TaskStatus
  tags: string[]
  category: string
  dueDate: string | null
  notes: string
  subtasks: Subtask[]
  sortOrder: number
  createdAt: number
  completedAt: number | null
  actualMs: number
}

export interface Project {
  id: number
  name: string
  color: string
  createdAt: number
}

export interface Session {
  id: number
  taskId: number
  startedAt: number
  endedAt: number | null
}

export interface Snapshot {
  tasks: Task[]
  projects: Project[]
  sessions: Session[]
  activeTaskId: number | null
}

export interface DesktopState {
  mode: Mode
  pinned: boolean
  opacity: number
  theme: Theme
  timerMode: TimerMode
  autostart: boolean
  notifications: boolean
  hotkeys: Hotkeys
  shortcutError?: string | null
}

export interface Hotkeys {
  toggleWindow: string
  toggleTimer: string
  quickTask: string
  cycleMode: string
}

export type TaskInput = Omit<Task, 'id' | 'status' | 'sortOrder' | 'createdAt' | 'completedAt' | 'actualMs' | 'subtasks'> & {
  id?: number
  subtasks: (Omit<Subtask, 'id'> & { id?: number })[]
}

export const statusLabels: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  paused: 'Paused',
  completed: 'Completed',
}

export const priorityLabels: Record<Priority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
}

export function localDate(value = Date.now()) {
  const date = new Date(value)
  const pad = (num: number) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function localDateTime(value: number) {
  const date = new Date(value)
  return `${localDate(value)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
}

export function clock(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((part) => String(part).padStart(2, '0')).join(':')
}

export function duration(ms: number) {
  const minutes = Math.floor(Math.abs(ms) / 60_000)
  if (minutes === 0) return ms === 0 ? '0m' : '<1m'
  const hours = Math.floor(minutes / 60)
  return [hours ? `${hours}h` : '', minutes % 60 ? `${minutes % 60}m` : ''].filter(Boolean).join(' ')
}

export function dateLabel(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function isToday(task: Task, now: number) {
  const today = localDate(now)
  if (task.status === 'completed') return task.completedAt !== null && localDate(task.completedAt) === today
  return task.dueDate ? task.dueDate <= today || task.status === 'in_progress' : true
}
