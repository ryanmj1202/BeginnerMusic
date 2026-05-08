import type { Note } from '../../../types/music'
import type { EditableNoteControlKey } from '../types'

export function getNoteControlValue(note: Note, key: EditableNoteControlKey) {
  const fallback = key === 'pan' || key === 'pitchBend' || key === 'modulation' || key === 'reverb' ? 0 : 1
  return Number(note[key] ?? fallback)
}

export function clampNoteControlValue(
  key: EditableNoteControlKey,
  rawValue: number,
) {
  if (key === 'pitchBend') return Math.max(-2, Math.min(2, rawValue))
  if (key === 'pan') return Math.max(-1, Math.min(1, rawValue))
  if (key === 'modulation' || key === 'reverb') return Math.max(0, Math.min(1, rawValue))
  if (key === 'velocity') return Math.max(0.05, Math.min(1, rawValue))
  return Math.max(0, Math.min(1, rawValue))
}

export function quantizeValue(value: number, step: number) {
  if (!Number.isFinite(step) || step <= 0) return value
  return Math.round(value / step) * step
}

export function getSelectedNoteValue(
  notes: Note[],
  key: EditableNoteControlKey,
) {
  if (notes.length === 0) return key === 'pan' || key === 'pitchBend' || key === 'modulation' || key === 'reverb' ? 0 : 1
  return notes.reduce((total, note) => total + getNoteControlValue(note, key), 0) / notes.length
}
