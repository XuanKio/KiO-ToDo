import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { ArrowDownToLine, List } from 'lucide-react'
import { useApp } from '../../app/store'
import { duration } from '../../shared/model'
import type { Project } from '../../shared/model'
import { Modal } from '../../shared/ui'

type Preview = {
  tasks: { name: string; estimateSeconds: number }[]
  totalEstimateSeconds: number
}

export function ImportTasks({ projects, initialProjectId, onClose }: { projects: Project[]; initialProjectId: number | null; onClose: () => void }) {
  const [text, setText] = useState('')
  const [projectId, setProjectId] = useState(initialProjectId)
  const [result, setResult] = useState<{ text: string; preview?: Preview; error?: string } | null>(null)
  const mutate = useApp((state) => state.mutate)
  const busy = useApp((state) => state.busy)
  const error = useApp((state) => state.error)

  useEffect(() => {
    if (!text.trim()) return
    let current = true
    const timer = window.setTimeout(async () => {
      try {
        const preview = await invoke<Preview>('preview_tasks', { text })
        if (current) setResult({ text, preview })
      } catch (reason) {
        if (current) setResult({ text, error: String(reason) })
      }
    }, 160)
    return () => {
      current = false
      window.clearTimeout(timer)
    }
  }, [text])

  const preview = result?.text === text ? result.preview : undefined
  const previewError = result?.text === text ? result.error : undefined
  return <Modal title="Quick task input" onClose={onClose}>
    <form className="editor-form" onSubmit={async (event) => {
      event.preventDefault()
      if (preview?.tasks.length && await mutate('import_tasks', { text, projectId })) onClose()
    }}>
      <div className="editor-main">
        <label>Tasks <textarea rows={7} value={text} autoFocus onChange={(event) => setText(event.target.value)} className="quick-input" placeholder={'Setup Scene : 30m\nCore Gameplay : 4h\nTutorial : 1h'} /></label>
        <p className="hint">Enter one task per line with its estimate, for example <code>Setup Scene : 30m</code>.</p>
        <label>Project <select value={projectId ?? ''} onChange={(event) => setProjectId(event.target.value ? Number(event.target.value) : null)}>
          <option value="">Unassigned</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select></label>
        {(previewError || error) && <p role="alert" className="form-error">{previewError || error}</p>}
        {preview && <div className="import-preview">
          <h3><List size={15} /> {preview.tasks.length} {preview.tasks.length === 1 ? 'task' : 'tasks'} <strong>{duration(preview.totalEstimateSeconds * 1000)} estimate</strong></h3>
          <ul>{preview.tasks.map((task, index) => <li key={index}><span>{task.name}</span><span>{duration(task.estimateSeconds * 1000)}</span></li>)}</ul>
        </div>}
        {text.trim() && result?.text !== text && <p className="hint" role="status">Checking task format…</p>}
      </div>
      <footer className="modal-footer">
        <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
        <button className="button primary" disabled={!preview?.tasks.length || busy} type="submit"><ArrowDownToLine size={16} /> Import {preview?.tasks.length || ''} {preview?.tasks.length === 1 ? 'task' : 'tasks'}</button>
      </footer>
    </form>
  </Modal>
}
