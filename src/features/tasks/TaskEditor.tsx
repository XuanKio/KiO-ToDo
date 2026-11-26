import { useState } from 'react'
import type { FormEvent } from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'
import { useApp } from '../../app/store'
import { priorityLabels } from '../../shared/model'
import type { Priority, Project, Task, TaskInput } from '../../shared/model'
import { IconButton, Modal } from '../../shared/ui'

type SubtaskDraft = TaskInput['subtasks'][number] & { key: number }

export function TaskEditor({ task, projects, initialProjectId, onClose }: { task?: Task; projects: Project[]; initialProjectId: number | null; onClose: () => void }) {
  const [subtasks, setSubtasks] = useState<SubtaskDraft[]>(() => task?.subtasks.map((item, key) => ({ ...item, key })) ?? [])
  const [nextKey, setNextKey] = useState(subtasks.length)
  const mutate = useApp((state) => state.mutate)
  const busy = useApp((state) => state.busy)
  const error = useApp((state) => state.error)

  function patchSubtask(key: number, patch: Partial<SubtaskDraft>) {
    setSubtasks((items) => items.map((item) => item.key === key ? { ...item, ...patch } : item))
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const value = (key: string) => String(form.get(key) ?? '').trim()
    const project = value('project')
    const input: TaskInput = {
      id: task?.id,
      name: value('name'),
      description: value('description'),
      projectId: project ? Number(project) : null,
      estimateSeconds: Math.round(Number(value('hours')) * 3600 + Number(value('minutes')) * 60),
      priority: value('priority') as Priority,
      tags: [...new Set(value('tags').split(',').map((tag) => tag.trim()).filter(Boolean))],
      category: value('category'),
      notes: value('notes'),
      dueDate: value('due') || null,
      subtasks: subtasks.map(({ id, name, completed }) => ({ id, name: name.trim(), completed })).filter((item) => item.name),
    }
    if (await mutate('save_task', { input })) onClose()
  }

  return <Modal title={task ? 'Edit task' : 'New task'} onClose={onClose}>
    <form className="editor-form" onSubmit={(event) => void save(event)}>
      <div className="editor-main">
        <label>Task name <input name="name" minLength={1} maxLength={200} required autoFocus placeholder="What are you working on?" defaultValue={task?.name} /></label>
        <label>Description <textarea name="description" rows={2} placeholder="Add context" defaultValue={task?.description} /></label>
        <div className="form-grid">
          <label>Project <select name="project" defaultValue={(task ? task.projectId : initialProjectId) ?? ''}>
            <option value="">Unassigned</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select></label>
          <label>Priority <select name="priority" defaultValue={task?.priority ?? 'normal'}>
            {Object.entries(priorityLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></label>
          <fieldset className="estimate-field"><legend>Estimate</legend>
            <label><input aria-label="Estimate hours" type="number" name="hours" min="0" max="10000" step="1" defaultValue={task ? Math.floor(task.estimateSeconds / 3600) : 0} /> h</label>
            <label><input aria-label="Estimate minutes" type="number" name="minutes" min="0" max="59.99" step="any" defaultValue={task ? +(task.estimateSeconds % 3600 / 60).toFixed(4) : 0} /> m</label>
          </fieldset>
          <label>Due date <input type="date" name="due" defaultValue={task?.dueDate ?? ''} /></label>
          <label>Category <input name="category" placeholder="e.g. Development" defaultValue={task?.category} /></label>
          <label>Tags <input name="tags" placeholder="Separate tags with commas" defaultValue={task?.tags.join(', ')} /></label>
        </div>
        <label>Notes <textarea name="notes" rows={2} placeholder="Add notes or a handoff" defaultValue={task?.notes} /></label>
        <fieldset className="subtask-field">
          <legend>Subtasks</legend>
          {subtasks.map((item, index) => <div className="subtask-row" key={item.key}>
            <input aria-label={`Subtask ${index + 1} complete`} type="checkbox" checked={item.completed} onChange={(event) => patchSubtask(item.key, { completed: event.target.checked })} />
            <input aria-label={`Subtask ${index + 1} name`} placeholder="Subtask name" value={item.name} onChange={(event) => patchSubtask(item.key, { name: event.target.value })} />
            <IconButton label={`Remove subtask ${index + 1}`} onClick={() => setSubtasks((current) => current.filter((subtask) => subtask.key !== item.key))}><Trash2 size={15} /></IconButton>
          </div>)}
          <button type="button" className="text-button" onClick={() => {
            setSubtasks([...subtasks, { name: '', completed: false, key: nextKey }])
            setNextKey(nextKey + 1)
          }}><Plus size={15} /> Add subtask</button>
        </fieldset>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <footer className="modal-footer">
        <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
        <button className="button primary" type="submit" disabled={busy}>{task ? <Check size={16} /> : <Plus size={16} />}{task ? 'Save changes' : 'Create task'}</button>
      </footer>
    </form>
  </Modal>
}
