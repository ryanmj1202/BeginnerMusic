import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { FLOAT_EPSILON } from '../constants'
import { createId } from '../helpers'
import type { PatternClipboard, SelectionBox } from '../types'
import type { Project, Track } from '../../../types/music'

type TrackNote = Project['notesByTrack'][string][number] & { trackId: string }

type UseClipboardActionsOptions = {
  clampBeatToSong: (beat: number, durationBeats?: number) => number
  deleteSelectedNotes: () => void
  getCurrentPlaybackBeat: () => number
  patternClipboardRef: MutableRefObject<PatternClipboard | null>
  selectedPatternNotes: TrackNote[]
  selectedTrack: Track | undefined
  setEditMenuOpen: Dispatch<SetStateAction<boolean>>
  setProject: Dispatch<SetStateAction<Project>>
  setSelectedNoteIds: Dispatch<SetStateAction<string[]>>
  setSelectionBox: Dispatch<SetStateAction<SelectionBox | null>>
  snapBeatToGrid: (beat: number) => number
}

export function useClipboardActions({
  clampBeatToSong,
  deleteSelectedNotes,
  getCurrentPlaybackBeat,
  patternClipboardRef,
  selectedPatternNotes,
  selectedTrack,
  setEditMenuOpen,
  setProject,
  setSelectedNoteIds,
  setSelectionBox,
  snapBeatToGrid,
}: UseClipboardActionsOptions) {
  function copySelectedNotes() {
    if (!selectedTrack || selectedPatternNotes.length === 0) return

    const sortedNotes = [...selectedPatternNotes].sort((left, right) => (
      left.startBeat - right.startBeat || left.pitch - right.pitch
    ))
    const firstBeat = Math.min(...sortedNotes.map((note) => note.startBeat))
    const lastBeat = Math.max(...sortedNotes.map((note) => note.startBeat + note.durationBeats))

    patternClipboardRef.current = {
      nextPasteBeat: lastBeat,
      notes: sortedNotes.map((note) => ({
        ...note,
        durationBeats: snapBeatToGrid(note.durationBeats),
        startBeat: snapBeatToGrid(note.startBeat - firstBeat),
      })),
      sourceTrackId: selectedTrack.id,
    }
    setEditMenuOpen(false)
  }

  function cutSelectedNotes() {
    if (!selectedTrack || selectedPatternNotes.length === 0) return

    copySelectedNotes()
    deleteSelectedNotes()
    setEditMenuOpen(false)
  }

  function pasteSelectedNotes() {
    if (!selectedTrack || !patternClipboardRef.current) return

    const clipboard = patternClipboardRef.current
    const currentBeat = getCurrentPlaybackBeat()
    const requestedPasteBeat = currentBeat > FLOAT_EPSILON ? currentBeat : clipboard.nextPasteBeat
    const pasteBeat = clampBeatToSong(snapBeatToGrid(requestedPasteBeat))
    const pastedNotes = clipboard.notes.map((note) => ({
      ...note,
      id: createId('note'),
      startBeat: clampBeatToSong(snapBeatToGrid(pasteBeat + note.startBeat), note.durationBeats),
    }))
    const pastedIds = pastedNotes.map((note) => note.id)
    const pastedEndBeat = Math.max(...pastedNotes.map((note) => note.startBeat + note.durationBeats))

    patternClipboardRef.current = {
      ...clipboard,
      nextPasteBeat: pastedEndBeat,
    }
    setSelectionBox(null)
    setSelectedNoteIds(pastedIds)
    setProject((current) => ({
      ...current,
      selectedNoteId: pastedIds[0] ?? null,
      notesByTrack: {
        ...current.notesByTrack,
        [selectedTrack.id]: [...(current.notesByTrack[selectedTrack.id] ?? []), ...pastedNotes],
      },
    }))
    setEditMenuOpen(false)
  }

  function duplicateSelectedNotes() {
    copySelectedNotes()
    pasteSelectedNotes()
  }

  return {
    copySelectedNotes,
    cutSelectedNotes,
    duplicateSelectedNotes,
    pasteSelectedNotes,
  }
}
