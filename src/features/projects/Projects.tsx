import { useState } from 'react'
import { ArrowRight, Check, Folder, FolderPlus, Pencil } from 'lucide-react'
import { useApp } from '../../app/store'
import { duration } from '../../shared/model'
import type { Project, Snapshot } from '../../shared/model'
import { IconButton, Modal } from '../../shared/ui'
import { Progress, ProjectDot } from '../timer/Focus'
import { summarizeProjects } from './metrics'

export function Projects({ snapshot, now, onBrowse, onEdit, onNew }: {
  snapshot: Snapshot
  now: number
  onBrowse: (id: number) => void
  onEdit: (project: Project) => void
  onNew: () => void
}) {
  const totals = summarizeProjects(snapshot, now)
  if (!snapshot.projects.length) return <section className="empty-tasks panel">
    <div className="empty-symbol"><Folder size={23} /></div>
    <h3>No projects yet</h3>
    <p>Create a project to group tasks and compare estimates with recorded time.</p>
    <button type="button" className="text-button" onClick={onNew}>Create a project <ArrowRight size={14} /></button>
  </section>

  return <div className="projects-grid">
    {snapshot.projects.map((project) => {
      const { count, completed, estimate, actual, remaining } = totals.get(project.id)!
      const variance = actual - estimate
      return <section className="project-card panel" key={project.id}>
        <header>
          <h2><ProjectDot project={project} /> {project.name}</h2>
          <IconButton label={`Edit project ${project.name}`} onClick={() => onEdit(project)}><Pencil size={15} /></IconButton>
        </header>
        <p className="hint">{completed} of {count} tasks completed</p>
        <Progress elapsed={actual} estimate={estimate} />
        <dl className="project-metrics">
          <div><dt>Estimate</dt><dd>{duration(estimate)}</dd></div>
          <div><dt>Actual</dt><dd>{duration(actual)}</dd></div>
          <div><dt>Remaining</dt><dd>{duration(remaining)}</dd></div>
          <div><dt>Variance</dt><dd className={variance > 0 ? 'metric-over' : ''}>{variance > 0 ? '+' : variance < 0 ? '−' : ''}{duration(variance)}</dd></div>
        </dl>
        <button className="text-button" type="button" onClick={() => onBrowse(project.id)}>View tasks <ArrowRight size={14} /></button>
      </section>
    })}
  </div>
}

export function ProjectEditor({ project, onClose }: { project?: Project; onClose: () => void }) {
  const [color, setColor] = useState(project?.color ?? '#9176f1')
  const mutate = useApp((state) => state.mutate)
  const busy = useApp((state) => state.busy)
  const error = useApp((state) => state.error)

  return <Modal title={project ? 'Edit project' : 'New project'} onClose={onClose}>
    <form className="editor-form" onSubmit={async (event) => {
      event.preventDefault()
      const name = String(new FormData(event.currentTarget).get('name')).trim()
      if (await mutate('save_project', { input: { id: project?.id, name, color } })) onClose()
    }}>
      <div className="editor-main">
        <label>Project name <input name="name" required maxLength={120} defaultValue={project?.name} autoFocus placeholder="e.g. Personal Game" /></label>
        <label className="project-color-field">Project color <input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <footer className="modal-footer">
        <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="button primary" disabled={busy}>{project ? <Check size={16} /> : <FolderPlus size={16} />}{project ? 'Save changes' : 'Create project'}</button>
      </footer>
    </form>
  </Modal>
}
