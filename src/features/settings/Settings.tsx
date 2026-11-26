import { useState } from 'react'
import type { FormEvent } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Bell, Check, Download, Keyboard, Pin, SlidersHorizontal, SunMoon, Timer, Waypoints } from 'lucide-react'
import { useApp } from '../../app/store'
import type { DesktopState, Hotkeys } from '../../shared/model'

const hotkeyFields = [
  ['toggleWindow', 'Show or hide the widget'],
  ['toggleTimer', 'Start or pause the timer'],
  ['quickTask', 'Create a task'],
  ['cycleMode', 'Switch window mode'],
] as const

export function Settings({ desktop }: { desktop: DesktopState }) {
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [opacity, setOpacity] = useState(() => Math.round(desktop.opacity * 100))
  const perform = useApp((state) => state.windowAction)
  const clearError = useApp((state) => state.clearError)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    clearError()
    setBusy(true)
    const form = new FormData(event.currentTarget)
    const shortcut = (key: keyof Hotkeys) => String(form.get(key) ?? '').trim()
    const hotkeys: Hotkeys = {
      toggleWindow: shortcut('toggleWindow'),
      toggleTimer: shortcut('toggleTimer'),
      quickTask: shortcut('quickTask'),
      cycleMode: shortcut('cycleMode'),
    }
    const success = await perform('set_desktop_preferences', { input: {
      opacity: opacity / 100,
      hotkeys,
      theme: form.get('theme'),
      timerMode: form.get('timerMode'),
      autostart: form.has('autostart'),
      notifications: form.has('notifications'),
    } })
    setSaved(success)
    setBusy(false)
  }

  return <div className="settings-form">
    <form className="settings-form" onSubmit={(event) => void save(event)} onChange={() => setSaved(false)}>
    <section className="panel settings-card">
      <h2><SunMoon size={18} /> Appearance and timer</h2>
      <label className="setting-row">
        <span>Theme</span>
        <select name="theme" defaultValue={desktop.theme} className="setting-input theme-select">
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </label>
      <label className="setting-row">
        <span>Timer style</span>
        <select name="timerMode" defaultValue={desktop.timerMode} className="setting-input theme-select">
          <option value="stopwatch">Stopwatch</option>
          <option value="countdown">Countdown</option>
        </select>
      </label>
      <p className="hint"><Timer size={13} /> Countdown uses the task estimate and keeps tracking overtime.</p>
    </section>
    <section className="panel settings-card">
      <h2><SlidersHorizontal size={18} /> Widget</h2>
      <div className="setting-row">
        <div><label htmlFor="widget-opacity">Opacity</label><p>Applies in Widget, Mini, and Bubble modes.</p></div>
        <div className="opacity-input">
          <input id="widget-opacity" type="range" min="35" max="100" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} />
          <output htmlFor="widget-opacity">{opacity}%</output>
        </div>
      </div>
      <div className="setting-row">
        <div><span>Always on top</span><p>Keep compact windows above other apps.</p></div>
        <button type="button" className={`button secondary ${desktop.pinned ? 'toggled' : ''}`} aria-pressed={desktop.pinned} onClick={() => void perform('set_pinned', { pinned: !desktop.pinned })}>
          <Pin size={15} fill={desktop.pinned ? 'currentColor' : 'none'} /> {desktop.pinned ? 'Pinned' : 'Unpinned'}
        </button>
      </div>
    </section>
    <section className="panel settings-card">
      <h2><Bell size={18} /> Windows</h2>
      <label className="setting-row">
        <div><span>Start with Windows</span><p>Launch Dev Focus when you sign in.</p></div>
        <input type="checkbox" name="autostart" defaultChecked={desktop.autostart} />
      </label>
      <label className="setting-row">
        <div><span>Timer notifications</span><p>Get a desktop notification when a task reaches its estimate.</p></div>
        <input type="checkbox" name="notifications" defaultChecked={desktop.notifications} />
      </label>
    </section>
    <section className="panel settings-card">
      <h2><Keyboard size={18} /> Global shortcuts</h2>
      <p className="hint">Use key combinations such as <kbd>Ctrl+Alt+F</kbd>.</p>
      {desktop.shortcutError && <p className="form-error" role="alert">{desktop.shortcutError}</p>}
      {hotkeyFields.map(([key, label]) => <label className="setting-row hotkey-field" key={key}>
        <span>{label}</span>
        <input className="setting-input" name={key} defaultValue={desktop.hotkeys[key]} required maxLength={60} spellCheck={false} />
      </label>)}
    </section>
    <div className="settings-actions">
      <button type="submit" className="button primary" disabled={busy}><Check size={16} /> Save settings</button>
      {saved && <span role="status">Settings saved</span>}
    </div>
    </form>
    <UpdateSettings />
  </div>
}

type UpdateResult = {
  status: 'unconfigured' | 'current' | 'available'
  version?: string | null
  notes?: string | null
}

function UpdateSettings() {
  const [result, setResult] = useState<UpdateResult | null>(null)
  const [pending, setPending] = useState<'check' | 'install' | null>(null)
  const showError = useApp((state) => state.showError)
  const clearError = useApp((state) => state.clearError)

  async function update(action: 'check' | 'install') {
    clearError()
    setPending(action)
    try {
      if (action === 'check') {
        setResult(null)
        setResult(await invoke<UpdateResult>('check_for_updates'))
      } else {
        await invoke('install_update')
        setResult(null)
      }
    } catch (error) {
      showError(error)
    } finally {
      setPending(null)
    }
  }

  return <section className="panel settings-card">
    <h2><Waypoints size={18} /> Updates</h2>
    <div className="setting-row">
      <div role="status">
        {pending === 'install' ? 'Installing update…' : pending === 'check' ? 'Checking for updates…' :
          result?.status === 'available' ? `Version ${result.version ?? ''} is available.` :
          result?.status === 'current' ? 'Dev Focus is up to date.' :
          result?.status === 'unconfigured' ? 'No update source configured.' : 'Check for a new version of Dev Focus.'}
      </div>
      <button type="button" className="button secondary" disabled={pending !== null} onClick={() => void update('check')}><Download size={15} /> Check for updates</button>
    </div>
    {result?.status === 'available' && <>
      {result.notes && <p className="release-notes">{result.notes}</p>}
      <button type="button" className="button primary install-update" disabled={pending !== null} onClick={() => void update('install')}>Install update</button>
    </>}
  </section>
}
