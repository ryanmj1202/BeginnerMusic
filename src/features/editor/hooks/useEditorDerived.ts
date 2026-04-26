import { useMemo } from 'react'
import type { Note } from '../../../types/music'
import type { EditableNoteControlKey } from '../types'

export type ActiveNoteControl = {
  format: (value: number) => string
  key: EditableNoteControlKey
  label: string
  max: number
  min: number
  step: number
} | null

export function useEditorDerived(
  activeDetailTerm: string,
  sortedEditableSelectedNotes: Note[],
) {
  const activeNoteControl = useMemo<ActiveNoteControl>(() => {
    if (activeDetailTerm === '소리 세기') return makeControl('velocity', '소리 세기', 0.05, 1, 0.01)
    if (activeDetailTerm === '음높이 휘기') {
      return { key: 'pitchBend', label: '음높이 휘기', min: -2, max: 2, step: 0.1, format: (value) => value.toFixed(1) }
    }
    if (activeDetailTerm === '음량') return makeControl('volume', '음량', 0, 1, 0.01)
    if (activeDetailTerm === '좌우 위치') return makeControl('pan', '좌우 위치', -1, 1, 0.01)
    if (activeDetailTerm === '연주 느낌') return makeControl('expression', '연주 느낌', 0, 1, 0.01)
    if (activeDetailTerm === '떨림') return makeControl('modulation', '떨림', 0, 1, 0.01)
    return null
  }, [activeDetailTerm])

  const detailGraphNotes = useMemo(
    () => (activeNoteControl ? sortedEditableSelectedNotes.slice(0, 128).map((note) => ({ ...note })) : []),
    [activeNoteControl, sortedEditableSelectedNotes],
  )

  const detailGraphBounds = useMemo(
    () => (
      detailGraphNotes.length > 0
        ? {
          maxBeat: Math.max(...detailGraphNotes.map((note) => note.startBeat + note.durationBeats)),
          minBeat: Math.min(...detailGraphNotes.map((note) => note.startBeat)),
        }
        : null
    ),
    [detailGraphNotes],
  )

  return { activeNoteControl, detailGraphBounds, detailGraphNotes }
}

function makeControl(
  key: EditableNoteControlKey,
  label: string,
  min: number,
  max: number,
  step: number,
) {
  return { key, label, min, max, step, format: (value: number) => `${Math.round(value * 100)}` } as const
}
