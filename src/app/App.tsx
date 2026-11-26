import { useEffect, useMemo, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { AlertTriangle, ArrowDownToLine, CalendarDays, ChartNoAxesColumn, CheckCircle2, CircleDashed, Folder, FolderPlus, HardDrive, History as HistoryIcon, LayoutDashboard, ListTodo, Plus, Settings2, X } from 'lucide-react'
import { useApp } from './store'
import { Brand, WindowTitle } from './WindowTitle'
import { TaskEditor } from '../features/tasks/TaskEditor'
import { ImportTasks } from '../features/tasks/ImportTasks'
import { TaskList } from '../features/tasks/TaskList'
import { ProjectEditor, Projects } from '../features/projects/Projects'
import { Dashboard } from '../features/reports/Dashboard'
import { History } from '../features/reports/History'
import { Statistics } from '../features/reports/Statistics'
import { Settings } from '../features/settings/Settings'
import { Bubble, Mini } from '../features/timer/Compact'
import { actualAt, currentTask, Focus, getActiveSession, useNow } from '../features/timer/Focus'
import { SessionEditor } from '../features/timer/SessionEditor'
import type { DesktopState, Task } from '../shared/model'
import { isToday } from '../shared/model'
import { IconButton } from '../shared/ui'

type Overlay = { type: 'task' | 'time' | 'project' | 'import'; id: number | null }

const views = [
  { id: 'all', label: 'All tasks', icon: ListTodo },
  { id: 'today', label: 'Today', icon: CalendarDays },
  { id: 'active', label: 'In progress', icon: CircleDashed },
  { id: 'done', label: 'Completed', icon: CheckCircle2 },
] as const
const workspaceViews = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'projects', label: 'Projects', icon: Folder },
  { id: 'history', label: 'History', icon: HistoryIcon },
  { id: 'statistics', label: 'Statistics', icon: ChartNoAxesColumn },
  { id: 'settings', label: 'Settings', icon: Settings2 },
] as const
type View = (typeof views | typeof workspaceViews)[number]['id']

export function App() {
  const [view, setView] = useState<View>('all')
  const [overlay, setOverlay] = useState<Overlay | null>(null)
  const [projectId, setProjectId] = useState<number | null>(null)
  const snapshot = useApp((state) => state.snapshot)
  const desktop = useApp((state) => state.desktop)
  const selectedId = useApp((state) => state.selectedId)
  const error = useApp((state) => state.error)
  const initialize = useApp((state) => state.initialize)
  const perform = useApp((state) => state.windowAction)
  const clearError = useApp((state) => state.clearError)
  const now = useNow(snapshot?.activeTaskId != null)
  const activeSession = useMemo(() => snapshot ? getActiveSession(snapshot) : undefined, [snapshot])

  useEffect(() => {
    const subscriptions = [
      listen('data-changed', () => void useApp.getState().refresh()),
      listen<DesktopState>('desktop-changed', ({ payload }) => useApp.getState().updateDesktop(payload)),
      listen<string>('desktop-error', ({ payload }) => useApp.getState().showError(payload)),
      listen('quick-task', () => {
        useApp.getState().clearError()
        setView('all')
        setOverlay({ type: 'task', id: null })
      }),
    ]
    void Promise.all(subscriptions).then(() => initialize()).catch(useApp.getState().showError)
    return () => { subscriptions.forEach((subscription) => void subscription.then((remove) => remove()).catch(() => {})) }
  }, [initialize])

  function edit(overlay: Overlay | null) {
    clearError()
    setOverlay(overlay)
  }

  async function newTask() {
    if (desktop?.mode !== 'full' && !await perform('set_mode', { mode: 'full' })) return
    setView('all')
    edit({ type: 'task', id: null })
  }

  if (!snapshot || !desktop) return <main className="loading-screen">
    <Brand />
    {error ? <><p role="alert">{error}</p><button type="button" className="button primary" onClick={() => void initialize()}>Try again</button></> : <p>Loading your workspace…</p>}
  </main>

  const activeTask = currentTask(snapshot, selectedId)
  const elapsed = activeTask ? actualAt(activeTask, activeSession, now) : 0
  const compact = desktop.mode !== 'full'
  const selectedTask = overlay?.id == null ? undefined : snapshot.tasks.find((task) => task.id === overlay.id)
  const selectedProject = overlay?.id == null ? undefined : snapshot.projects.find((project) => project.id === overlay.id)
  const isActive = (task: Task) => ['in_progress', 'paused'].includes(task.status)
  const taskViews = {
    all: snapshot.tasks,
    today: snapshot.tasks.filter((task) => isToday(task, now)),
    active: snapshot.tasks.filter(isActive),
    done: snapshot.tasks.filter((task) => task.status === 'completed'),
  }
  const date = new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  const taskView = view === 'all' || view === 'today' || view === 'active' || view === 'done'
  const pageTitle = [...views, ...workspaceViews].find((item) => item.id === view)?.label

  return (
    <div className={`app-frame mode-${desktop.mode} theme-${desktop.theme}`} style={{ opacity: compact ? desktop.opacity : 1 }}>
      {(desktop.mode === 'full' || desktop.mode === 'widget') && <WindowTitle desktop={desktop} />}
      {desktop.mode === 'mini' && <Mini task={activeTask} elapsed={elapsed} desktop={desktop} />}
      {desktop.mode === 'bubble' && <Bubble task={activeTask} elapsed={elapsed} desktop={desktop} />}
      {desktop.mode === 'widget' && <Focus task={activeTask} snapshot={snapshot} elapsed={elapsed} now={now} compact timerMode={desktop.timerMode} onNew={() => void newTask()} />}
      {!compact &&
        <div className="workspace">
          <aside className="sidebar">
            <div className="sidebar-brand"><Brand /></div>
            <div className="sidebar-heading">Tasks</div>
            <nav aria-label="Task views">
              {views.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={`nav-item ${view === id ? 'selected' : ''}`} aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}>
                <Icon size={17} /><span>{label}</span><small>{taskViews[id].length}</small>
              </button>)}
            </nav>
            <div className="sidebar-heading sidebar-section">Workspace</div>
            <nav aria-label="Workspace management">
              {workspaceViews.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={`nav-item ${view === id ? 'selected' : ''}`} aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}><Icon size={17} /><span>{label}</span></button>)}
            </nav>
            <div className="sidebar-footer"><HardDrive size={15} /><span>Local workspace</span><i /></div>
          </aside>
          <main className="main-panel">
            <header className="page-heading">
              <div>{taskView && <p className="page-date"><CalendarDays size={14} /> {date}</p>}<h1>{pageTitle}</h1></div>
              {taskView && <div className="page-actions">
                <button className="button secondary" type="button" onClick={() => edit({ type: 'import', id: null })}><ArrowDownToLine size={16} /> Quick input</button>
                <button type="button" className="button primary" onClick={() => void newTask()}><Plus size={18} /> New task</button>
              </div>}
              {view === 'projects' && <button type="button" className="button primary" onClick={() => edit({ type: 'project', id: null })}><FolderPlus size={16} /> New project</button>}
            </header>
            {taskView && <>
              <Focus task={activeTask} snapshot={snapshot} elapsed={elapsed} now={now} timerMode={desktop.timerMode} onNew={() => void newTask()} onTime={() => { if (activeTask) edit({ type: 'time', id: activeTask.id }) }} />
              <TaskList tasks={taskViews[view]} snapshot={snapshot} now={now} projectId={projectId} onProject={setProjectId} onEdit={(task) => edit({ type: 'task', id: task.id })} onTime={(task) => edit({ type: 'time', id: task.id })} onNew={() => void newTask()} />
            </>}
            {view === 'projects' && <Projects snapshot={snapshot} now={now} onBrowse={(id) => { setProjectId(id); setView('all') }} onEdit={(project) => edit({ type: 'project', id: project.id })} onNew={() => edit({ type: 'project', id: null })} />}
            {view === 'dashboard' && <Dashboard snapshot={snapshot} now={now} />}
            {view === 'history' && <History snapshot={snapshot} now={now} onEdit={(id) => edit({ type: 'time', id })} />}
            {view === 'statistics' && <Statistics snapshot={snapshot} now={now} />}
            {view === 'settings' && <Settings desktop={desktop} />}
          </main>
        </div>
      }
      {overlay?.type === 'task' && !compact && <TaskEditor task={selectedTask} projects={snapshot.projects} initialProjectId={projectId} onClose={() => edit(null)} />}
      {overlay?.type === 'time' && selectedTask && !compact && <SessionEditor task={selectedTask} sessions={snapshot.sessions} onClose={() => edit(null)} />}
      {overlay?.type === 'project' && !compact && <ProjectEditor project={selectedProject} onClose={() => edit(null)} />}
      {overlay?.type === 'import' && !compact && <ImportTasks projects={snapshot.projects} initialProjectId={projectId} onClose={() => edit(null)} />}
      {error && (!overlay || compact) && <div className="toast" role="alert"><AlertTriangle size={16} /><span>{error}</span><IconButton label="Dismiss error" onClick={clearError}><X size={16} /></IconButton></div>}
    </div>
  )
}
