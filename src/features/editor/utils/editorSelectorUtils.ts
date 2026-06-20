import type { CSSProperties } from 'react'
import type { Note, Project } from '../../../types/music'
import {
  BEATS_PER_BAR,
  KEY_COLUMN_WIDTH,
  ROLL_ROW_HEIGHT,
} from '../constants'
import { getNotesEndBeat } from '../helpers'

export type TrackNote = Note & { trackId: string }
export type RollSurfaceStyle = CSSProperties & Record<string, string | number>

export function withTrackId(notes: Note[], trackId: string | undefined): TrackNote[] {
  return notes.map((note) => ({ ...note, trackId: trackId ?? '' }))
}

export function groupNotesByPitch(notes: TrackNote[]) {
  const notesByPitch = new Map<number, TrackNote[]>()

  notes.forEach((note) => {
    const pitchNotes = notesByPitch.get(note.pitch) ?? []
    pitchNotes.push(note)
    notesByPitch.set(note.pitch, pitchNotes)
  })

  return notesByPitch
}

export function getProjectEndBeat(project: Project) {
  const notesEndBeat = getNotesEndBeat(project.notesByTrack)
  const clipsEndBeat = (project.audioClips ?? []).reduce(
    (latestEnd, clip) => Math.max(latestEnd, clip.startBeat + clip.durationBeats),
    0,
  )
  const placementsEndBeat = (project.patternPlacements ?? []).reduce(
    (latestEnd, placement) => Math.max(latestEnd, placement.startBeat + placement.spanBeats),
    0,
  )

  return Math.max(notesEndBeat, clipsEndBeat, placementsEndBeat)
}

export function createRollSurfaceStyles({
  beatWidth,
  rollPitchCount,
  stepWidth,
  totalBeats,
  totalSteps,
  visibleBars,
}: {
  beatWidth: number
  rollPitchCount: number
  stepWidth: number
  totalBeats: number
  totalSteps: number
  visibleBars: number
}) {
  const rollSurfaceStyle: RollSurfaceStyle = {
    '--bar-width': `${beatWidth * BEATS_PER_BAR}px`,
    '--beat-width': `${beatWidth}px`,
    '--roll-grid-height': `${rollPitchCount * ROLL_ROW_HEIGHT}px`,
    '--roll-grid-width': `${totalBeats * beatWidth}px`,
    '--step-width': `${stepWidth}px`,
    '--total-steps': totalSteps,
    '--visible-bars': visibleBars,
  }
  const rollShellStyle: RollSurfaceStyle = {
    ...rollSurfaceStyle,
    gridTemplateColumns: `${KEY_COLUMN_WIDTH}px minmax(${totalBeats * beatWidth}px, 1fr)`,
  }

  return { rollShellStyle, rollSurfaceStyle }
}
