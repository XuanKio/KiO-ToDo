import { invoke } from '@tauri-apps/api/core'
import { create } from 'zustand'
import type { DesktopState, Snapshot } from '../shared/model'

type Arguments = Record<string, unknown>

interface AppState {
  snapshot: Snapshot | null
  desktop: DesktopState | null
  selectedId: number | null
  busy: boolean
  error: string | null
  initialize: () => Promise<void>
  refresh: () => Promise<void>
  select: (id: number) => void
  mutate: (command: string, args?: Arguments) => Promise<boolean>
  windowAction: (command: string, args?: Arguments) => Promise<boolean>
  updateDesktop: (desktop: DesktopState) => void
  showError: (error: unknown) => void
  clearError: () => void
}

export const useApp = create<AppState>((set, get) => ({
  snapshot: null,
  desktop: null,
  selectedId: null,
  busy: false,
  error: null,
  initialize: async () => {
    try {
      const [snapshot, desktop] = await Promise.all([
        invoke<Snapshot>('snapshot'),
        invoke<DesktopState>('desktop_state'),
      ])
      set({ snapshot, desktop, error: null })
    } catch (error) {
      get().showError(error)
    }
  },
  refresh: async () => {
    try {
      set({ snapshot: await invoke<Snapshot>('snapshot') })
    } catch (error) {
      get().showError(error)
    }
  },
  select: (selectedId) => set({ selectedId }),
  mutate: async (command, args) => {
    if (get().busy) return false
    set({ busy: true, error: null })
    try {
      set({ snapshot: await invoke<Snapshot>(command, args) })
      return true
    } catch (error) {
      get().showError(error)
      return false
    } finally {
      set({ busy: false })
    }
  },
  windowAction: async (command, args) => {
    try {
      const desktop = await invoke<DesktopState | null>(command, args)
      if (desktop) set({ desktop })
      return true
    } catch (error) {
      get().showError(error)
      return false
    }
  },
  updateDesktop: (desktop) => set({ desktop }),
  showError: (error) => set({ error: error instanceof Error ? error.message : String(error) }),
  clearError: () => set({ error: null }),
}))
