import { useMemo, type CSSProperties } from 'react'
import { expandProjectForArrangement } from '../../../lib/arrangement/trackArrangement'
import { isDrumInstrument } from '../../../lib/audio/toneTransport'
import type { Note, Project } from '../../../types/music'
import {
  BEATS_PER_BAR,
  DEFAULT_BEAT_WIDTH,
  DEFAULT_PROJECT_LENGTH_BEATS,
  DRUM_PITCHES,
  EDITING_TAIL_BEATS,
  KEY_COLUMN_WIDTH,
  MIN_DURATION_BEATS,
  ROLL_ROW_HEIGHT,
} from '../constants'
import {
  getDynamicPitches,
  getNormalizedTempoSections,
  getNotesEndBeat,
  getPatternRepeatGroupNoteIds,
  getVisibleBars,
} from '../helpers'
import type { EditorTab, NoteDivision, RollZoom } from '../types'

type UseEditorSelectorsOptions = {
  activeEditorTab: EditorTab
  allTrackMelodyMode: boolean
  browserZoom: number
  lastNoteDurationBeats: number
  noteDivision: NoteDivision
  project: Project
  rollZoom: RollZoom
  selectedNoteIds: string[]
  selectedTempoSectionId: string | null
}

type RollSurfaceStyle = CSSProperties & Record<string, string | number>

function withTrackId(notes: Note[], trackId: string | undefined) {
  return notes.map((note) => ({ ...note, trackId: trackId ?? '' }))
}

function groupNotesByPitch(notes: Array<Note & { trackId: string }>) {
  const notesByPitch = new Map<number, Array<Note & { trackId: string }>>()

  notes.forEach((note) => {
    const pitchNotes = notesByPitch.get(note.pitch) ?? []
    pitchNotes.push(note)
    notesByPitch.set(note.pitch, pitchNotes)
  })

  return notesByPitch
}

export function useEditorSelectors({
  activeEditorTab,
  allTrackMelodyMode,
  browserZoom,
  lastNoteDurationBeats,
  noteDivision,
  project,
  rollZoom,
  selectedNoteIds,
  selectedTempoSectionId,
}: UseEditorSelectorsOptions) {
  const selectedTrack = useMemo(
    () => project.tracks.find((track) => track.id === project.selectedTrackId) ?? project.tracks[0],
    [project.selectedTrackId, project.tracks],
  )

  const selectedTrackNotes = useMemo(
    () => (selectedTrack ? project.notesByTrack[selectedTrack.id] ?? [] : []),
    [project.notesByTrack, selectedTrack],
  )

  const selectedAudioClips = useMemo(
    () => (selectedTrack ? (project.audioClips ?? []).filter((clip) => clip.trackId === selectedTrack.id) : []),
    [project.audioClips, selectedTrack],
  )

  const selectedTrackIsAudio = selectedTrack?.kind === 'audio' || selectedTrack?.instrumentId === 'audio-track'

  const allTrackNotes = useMemo(
    () => project.tracks.flatMap((track) => (
      (project.notesByTrack[track.id] ?? []).map((note) => ({ ...note, trackId: track.id }))
    )),
    [project.notesByTrack, project.tracks],
  )

  const editableNotePool = useMemo(
    () => (allTrackMelodyMode ? allTrackNotes : withTrackId(selectedTrackNotes, selectedTrack?.id)),
    [allTrackMelodyMode, allTrackNotes, selectedTrack?.id, selectedTrackNotes],
  )

  const selectedNote = useMemo(
    () => editableNotePool.find((note) => note.id === project.selectedNoteId) ?? null,
    [editableNotePool, project.selectedNoteId],
  )

  const selectedNoteIdSet = useMemo(() => new Set(selectedNoteIds), [selectedNoteIds])

  const selectedPatternNotes = useMemo(
    () => editableNotePool.filter((note) => selectedNoteIdSet.has(note.id)),
    [editableNotePool, selectedNoteIdSet],
  )

  const allTrackNotesById = useMemo(
    () => new Map(allTrackNotes.map((note) => [note.id, note])),
    [allTrackNotes],
  )

  const allTrackNoteIdSet = useMemo(
    () => new Set(allTrackNotes.map((note) => note.id)),
    [allTrackNotes],
  )

  const patternRepeatGroupByNoteId = useMemo(() => {
    const groupByNoteId = new Map()

    ;(project.patternRepeatGroups ?? []).forEach((group) => {
      getPatternRepeatGroupNoteIds(group).forEach((noteId) => {
        groupByNoteId.set(noteId, group)
      })
    })

    return groupByNoteId
  }, [project.patternRepeatGroups])

  const selectedPatternRepeatGroup = useMemo(() => {
    if (selectedNoteIds.length === 0) return null

    const selectedIds = new Set(selectedNoteIds)

    return (project.patternRepeatGroups ?? []).find((group) => {
      const groupNoteIds = getPatternRepeatGroupNoteIds(group)
      return groupNoteIds.length === selectedIds.size && groupNoteIds.every((noteId) => selectedIds.has(noteId))
    }) ?? null
  }, [project.patternRepeatGroups, selectedNoteIds])

  const editableSelectedNotes = useMemo(
    () => (selectedPatternNotes.length > 0 ? selectedPatternNotes : selectedNote ? [selectedNote] : []),
    [selectedNote, selectedPatternNotes],
  )

  const sortedEditableSelectedNotes = useMemo(
    () => [...editableSelectedNotes].sort((left, right) => left.startBeat - right.startBeat || right.pitch - left.pitch),
    [editableSelectedNotes],
  )

  const arrangedProject = useMemo(
    () => (activeEditorTab === 'arrange' ? expandProjectForArrangement(project) : project),
    [activeEditorTab, project],
  )

  const projectEndBeat = useMemo(() => {
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
  }, [project.audioClips, project.notesByTrack, project.patternPlacements])

  const projectLengthBeats = Math.max(DEFAULT_PROJECT_LENGTH_BEATS, projectEndBeat + EDITING_TAIL_BEATS)
  const visibleBars = getVisibleBars(projectLengthBeats)
  const totalBeats = visibleBars * BEATS_PER_BAR
  const tempoSections = useMemo(() => getNormalizedTempoSections(project, totalBeats), [project, totalBeats])
  const stepsPerBeat = noteDivision / 4
  const defaultDurationSourceBeats = selectedNote?.durationBeats ?? lastNoteDurationBeats
  const defaultDurationBeats = Math.max(
    MIN_DURATION_BEATS,
    Math.round(defaultDurationSourceBeats * stepsPerBeat) / stepsPerBeat,
  )
  const totalSteps = totalBeats * stepsPerBeat

  const rollPitches = useMemo(() => {
    if (!allTrackMelodyMode && selectedTrack?.instrumentId && isDrumInstrument(selectedTrack.instrumentId)) {
      return DRUM_PITCHES
    }

    return getDynamicPitches(allTrackMelodyMode ? allTrackNotes : selectedTrackNotes)
  }, [allTrackMelodyMode, allTrackNotes, selectedTrack?.instrumentId, selectedTrackNotes])

  const selectedTempoSection = useMemo(
    () => tempoSections.find((section) => section.id === selectedTempoSectionId) ?? null,
    [selectedTempoSectionId, tempoSections],
  )

  const beatWidth = DEFAULT_BEAT_WIDTH * rollZoom * browserZoom
  const stepWidth = beatWidth / stepsPerBeat
  const rollTimelineStyle = { gridTemplateColumns: `repeat(${visibleBars}, minmax(64px, 1fr))` }
  const rollSurfaceStyle: RollSurfaceStyle = {
    '--bar-width': `${beatWidth * BEATS_PER_BAR}px`,
    '--beat-width': `${beatWidth}px`,
    '--roll-grid-height': `${rollPitches.length * ROLL_ROW_HEIGHT}px`,
    '--roll-grid-width': `${totalBeats * beatWidth}px`,
    '--step-width': `${stepWidth}px`,
    '--total-steps': totalSteps,
    '--visible-bars': visibleBars,
  }
  const rollShellStyle: RollSurfaceStyle = {
    ...rollSurfaceStyle,
    gridTemplateColumns: `${KEY_COLUMN_WIDTH}px minmax(${totalBeats * beatWidth}px, 1fr)`,
  }

  const selectedNotesByPitch = useMemo(
    () => groupNotesByPitch(editableNotePool),
    [editableNotePool],
  )

  const otherNotesByPitch = useMemo(() => {
    if (allTrackMelodyMode) return new Map()

    return groupNotesByPitch(
      project.tracks
        .filter((track) => track.id !== selectedTrack?.id)
        .flatMap((track) => withTrackId(project.notesByTrack[track.id] ?? [], track.id)),
    )
  }, [allTrackMelodyMode, project.notesByTrack, project.tracks, selectedTrack?.id])

  return {
    allTrackNoteIdSet,
    allTrackNotes,
    allTrackNotesById,
    arrangedProject,
    beatWidth,
    defaultDurationBeats,
    editableSelectedNotes,
    otherNotesByPitch,
    patternRepeatGroupByNoteId,
    projectLengthBeats,
    rollPitches,
    rollShellStyle,
    rollSurfaceStyle,
    rollTimelineStyle,
    selectedAudioClips,
    selectedNote,
    selectedNoteIdSet,
    selectedNotesByPitch,
    selectedPatternNotes,
    selectedPatternRepeatGroup,
    selectedTempoSection,
    selectedTrack,
    selectedTrackIsAudio,
    selectedTrackNotes,
    sortedEditableSelectedNotes,
    stepWidth,
    stepsPerBeat,
    tempoSections,
    totalBeats,
    totalSteps,
    visibleBars,
  }
}
