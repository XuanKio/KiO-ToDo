import { useState } from 'react'
import type { FormEvent } from 'react'
import { Check, Pencil, Plus } from 'lucide-react'
import { useApp } from '../../app/store'
import { clock, localDateTime } from '../../shared/model'
import type { Session, Task } from '../../shared/model'
import { IconButton, Modal } from '../../shared/ui'

export function SessionEditor({ task, sessions, onClose }: { task: Task; sessions: Session[]; onClose: () => void }) {
  const [session, setSession] = useState<Session | null>(null)
  const [editing, setEditing] = useState(false)
  const [validation, setValidation] = useState('')
  const mutate = useApp((state) => state.mutate)
  const busy = useApp((state) => state.busy)
  const error = useApp((state) => state.error)
  const closed = sessions.filter((item) => item.taskId === task.id && item.endedAt !== null)
    .sort((a, b) => b.startedAt - a.startedAt)
  const now = Date.now()

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const startedAt = new Date(String(form.get('from'))).getTime()
    const endedAt = new Date(String(form.get('to'))).getTime()
    if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || startedAt >= endedAt) {
      setValidation('Choose an end time after the start time.')
      return
    }
    setValidation('')
    if (await mutate('save_session', { id: session?.id ?? null, taskId: task.id, startedAt, endedAt })) setEditing(false)
  }

  function edit(item: Session | null) {
    setSession(item)
    setEditing(true)
    setValidation('')
  }

  return <Modal title="Recorded time" onClose={onClose}>
    <div className="editor-main session-editor">
      <div className="session-heading">
        <div><h3>{task.name}</h3><p>{closed.length} saved {closed.length === 1 ? 'session' : 'sessions'}</p></div>
        <button type="button" className="button secondary" onClick={() => edit(null)}><Plus size={16} /> Add time</button>
      </div>
      {editing && <form className="session-form" key={session?.id ?? 'new'} onSubmit={(event) => void save(event)}>
        <label>Start time <input required step="1" autoFocus type="datetime-local" name="from" defaultValue={localDateTime(session?.startedAt ?? now - 30 * 60_000)} /></label>
        <label>End time <input required step="1" type="datetime-local" name="to" defaultValue={localDateTime(session?.endedAt ?? now)} /></label>
        <button className="button primary" type="submit" disabled={busy}><Check size={16} /> Save time</button>
      </form>}
      {(validation || error) && <p className="form-error" role="alert">{validation || error}</p>}
      <div className="session-list">
        {closed.map((item) => <div key={item.id}>
          <span>{new Date(item.startedAt).toLocaleString()}</span>
          <strong>{clock((item.endedAt ?? item.startedAt) - item.startedAt)}</strong>
          <IconButton label="Edit session" onClick={() => edit(item)}><Pencil size={14} /></IconButton>
        </div>)}
        {!closed.length && <p className="hint">Sessions appear here after you pause or complete the task.</p>}
      </div>
    </div>
  </Modal>
}
