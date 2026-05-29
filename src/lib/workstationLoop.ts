import type { Project } from '../types/music'

export const WORKSTATION_LOOP_LENGTH_OPTIONS = [4, 8, 16] as const

export type WorkstationLoopSettings = {
  enabled: boolean
  lengthBeats: number
}

const STORAGE_KEY = 'beginner-music-workstation-loop'
const DEFAULT_SETTINGS: WorkstationLoopSettings = {
  enabled: false,
  lengthBeats: 4,
}

const listeners = new Set<(settings: WorkstationLoopSettings) => void>()
let cachedSettings: WorkstationLoopSettings = readStoredSettings()

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readStoredSettings(): WorkstationLoopSettings {
  if (!canUseStorage()) return DEFAULT_SETTINGS

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    return normalizeWorkstationLoopSettings(JSON.parse(raw) as Partial<WorkstationLoopSettings>)
  } catch {
    return DEFAULT_SETTINGS
  }
}

function writeStoredSettings(settings: WorkstationLoopSettings) {
  if (!canUseStorage()) return

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Local storage can be unavailable in private or restricted browser modes.
  }
}

export function normalizeWorkstationLoopLength(lengthBeats: number | undefined) {
  const safeLength = Number.isFinite(lengthBeats) ? Number(lengthBeats) : DEFAULT_SETTINGS.lengthBeats
  return WORKSTATION_LOOP_LENGTH_OPTIONS.reduce((closest, option) => (
    Math.abs(option - safeLength) < Math.abs(closest - safeLength) ? option : closest
  ), WORKSTATION_LOOP_LENGTH_OPTIONS[0])
}

export function normalizeWorkstationLoopSettings(
  settings: Partial<WorkstationLoopSettings> | undefined,
): WorkstationLoopSettings {
  return {
    enabled: Boolean(settings?.enabled),
    lengthBeats: normalizeWorkstationLoopLength(settings?.lengthBeats),
  }
}

export function getWorkstationLoopSettings(project?: Project): WorkstationLoopSettings {
  if (project?.workstationLoop) {
    return normalizeWorkstationLoopSettings(project.workstationLoop)
  }

  return cachedSettings
}

export function setWorkstationLoopSettings(update: Partial<WorkstationLoopSettings>) {
  cachedSettings = normalizeWorkstationLoopSettings({
    ...cachedSettings,
    ...update,
  })
  writeStoredSettings(cachedSettings)
  listeners.forEach((listener) => listener(cachedSettings))
}

export function subscribeWorkstationLoopSettings(listener: (settings: WorkstationLoopSettings) => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getActiveWorkstationLoopLength(project: Project, totalBeats: number) {
  const settings = getWorkstationLoopSettings(project)
  return Math.max(1, Math.min(Math.max(1, totalBeats), settings.lengthBeats))
}
