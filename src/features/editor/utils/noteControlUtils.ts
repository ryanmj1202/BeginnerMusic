import type { Note } from '../../../types/music'
import type { EditableNoteControlKey } from '../types'

export function getNoteControlValue(note: Note, key: EditableNoteControlKey) {
  const fallback = key === 'pan' || key === 'pitchBend' || key === 'modulation' || key === 'reverb' ? 0 : 1
  return Number(note[key] ?? fallback)
}

export function getNoteControlAutomation(note: Note, key: EditableNoteControlKey) {
  return [...(note.controlAutomation?.[key] ?? [])]
    .filter((point) => (
      Number.isFinite(point.beatOffset) &&
      Number.isFinite(point.value) &&
      point.beatOffset >= 0 &&
      point.beatOffset <= note.durationBeats
    ))
    .sort((left, right) => left.beatOffset - right.beatOffset)
}

export function getAutomatedNoteControlValue(
  note: Note,
  key: EditableNoteControlKey,
  beatOffset: number,
) {
  const points = getNoteControlAutomation(note, key)
  if (points.length === 0) return getNoteControlValue(note, key)

  const safeOffset = Math.max(0, Math.min(note.durationBeats, beatOffset))
  const firstPoint = points[0]
  if (safeOffset <= firstPoint.beatOffset) {
    const baseValue = getNoteControlValue(note, key)
    if (firstPoint.beatOffset <= 0.0001) return firstPoint.value
    const ratio = safeOffset / firstPoint.beatOffset
    return baseValue + (firstPoint.value - baseValue) * ratio
  }

  for (let index = 1; index < points.length; index += 1) {
    const nextPoint = points[index]
    const previousPoint = points[index - 1]
    if (safeOffset > nextPoint.beatOffset) continue

    const span = Math.max(0.0001, nextPoint.beatOffset - previousPoint.beatOffset)
    const ratio = (safeOffset - previousPoint.beatOffset) / span
    return previousPoint.value + (nextPoint.value - previousPoint.value) * ratio
  }

  return points[points.length - 1].value
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
