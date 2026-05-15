import type {
  Dispatch,
  SetStateAction,
} from 'react'
import {
  getInstrumentPreviewPitch,
  previewNote,
} from '../../../lib/audio/toneTransport'
import type {
  InstrumentId,
  Project,
  Track,
} from '../../../types/music'
import {
  TRACK_COLORS,
} from '../constants'
import {
  createId,
  getInstrumentCategory,
} from '../helpers'

type UseTrackActionsOptions = {
  instrumentDialogTrack: Track | null
  pendingInstrumentId: InstrumentId | null
  setInstrumentCategory: Dispatch<SetStateAction<string>>
  setInstrumentMenuTrackId: Dispatch<SetStateAction<string | null>>
  setPendingInstrumentId: Dispatch<SetStateAction<InstrumentId | null>>
  setProject: Dispatch<SetStateAction<Project>>
}

export function useTrackActions({
  instrumentDialogTrack,
  pendingInstrumentId,
  setInstrumentCategory,
  setInstrumentMenuTrackId,
  setPendingInstrumentId,
  setProject,
}: UseTrackActionsOptions) {
  function addTrack() {
    setProject((current) => {
      const trackId = createId('track')

      const nextTrack: Track = {
        id: trackId,
        name: `악기 ${current.tracks.length + 1}`,
        instrumentId: 'gm-0',
        kind: 'instrument',
        volume: 0.85,
        pan: 0,
        mute: false,
        solo: false,
        channel: Math.min(16, current.tracks.length + 1),
        color: TRACK_COLORS[current.tracks.length % TRACK_COLORS.length],
      }

      return {
        ...current,
        selectedTrackId: trackId,
        selectedNoteId: null,
        tracks: [...current.tracks, nextTrack],
        notesByTrack: {
          ...current.notesByTrack,
          [trackId]: [],
        },
      }
    })
  }

  function updateTrack(trackId: string, updates: Partial<Track>) {
    setProject((current) => {
      const nextSoloTrackId = updates.solo ? trackId : null
      let changed = false

      const tracks = current.tracks.map((track) => {
        if (nextSoloTrackId && track.id !== nextSoloTrackId && track.solo) {
          changed = true
          return {
            ...track,
            solo: false,
          }
        }

        if (track.id !== trackId) return track

        const nextTrack = {
          ...track,
          ...updates,
          ...(updates.solo ? { mute: false } : null),
          ...(updates.mute ? { solo: false } : null),
        }

        if (
          nextTrack.instrumentId !== track.instrumentId ||
          nextTrack.volume !== track.volume ||
          nextTrack.pan !== track.pan ||
          nextTrack.mute !== track.mute ||
          nextTrack.solo !== track.solo ||
          nextTrack.channel !== track.channel ||
          nextTrack.name !== track.name ||
          nextTrack.color !== track.color ||
          nextTrack.pianoRollVisible !== track.pianoRollVisible ||
          nextTrack.pianoRollOpacity !== track.pianoRollOpacity
        ) {
          changed = true
          return nextTrack
        }

        return track
      })

      return changed
        ? {
            ...current,
            tracks,
          }
        : current
    })
  }

  function selectTrack(trackId: string) {
    setProject((current) =>
      current.selectedTrackId === trackId && current.selectedNoteId === null
        ? current
        : {
            ...current,
            selectedTrackId: trackId,
            selectedNoteId: null,
          },
    )
  }

  function deleteTrack(trackId: string) {
    setProject((current) => {
      if (current.tracks.length <= 1) return current

      const nextTracks = current.tracks.filter((track) => track.id !== trackId)

      const nextNotesByTrack = Object.fromEntries(
        Object.entries(current.notesByTrack).filter(([notesTrackId]) => notesTrackId !== trackId),
      )

      const selectedTrackId =
        current.selectedTrackId === trackId
          ? nextTracks[0].id
          : current.selectedTrackId

      return {
        ...current,
        selectedTrackId,
        selectedNoteId: null,
        tracks: nextTracks,
        notesByTrack: nextNotesByTrack,
        audioClips: (current.audioClips ?? []).filter((clip) => clip.trackId !== trackId),
        patternPlacements: (current.patternPlacements ?? []).filter((placement) => placement.trackId !== trackId),
      }
    })
  }

  function cycleTrackColor(trackId: string) {
    setProject((current) => ({
      ...current,
      tracks: current.tracks.map((track) => {
        if (track.id !== trackId) return track

        const currentIndex = TRACK_COLORS.indexOf(track.color ?? TRACK_COLORS[0])

        return {
          ...track,
          color: TRACK_COLORS[(currentIndex + 1) % TRACK_COLORS.length],
        }
      }),
    }))
  }

  function selectInstrument(trackId: string, instrumentId: InstrumentId) {
    updateTrack(trackId, {
      instrumentId,
    })

    setInstrumentMenuTrackId(null)
    setPendingInstrumentId(null)
  }

  function openInstrumentDialog(track: Track) {
    selectTrack(track.id)
    setInstrumentMenuTrackId(track.id)
    setPendingInstrumentId(track.instrumentId)
    setInstrumentCategory(getInstrumentCategory(track.instrumentId))
  }

  function closeInstrumentDialog() {
    setInstrumentMenuTrackId(null)
    setPendingInstrumentId(null)
  }

  function confirmInstrumentDialog() {
    if (!instrumentDialogTrack || !pendingInstrumentId) {
      closeInstrumentDialog()
      return
    }

    selectInstrument(instrumentDialogTrack.id, pendingInstrumentId)
  }

  function previewInstrumentChoice(instrumentId: InstrumentId) {
    setPendingInstrumentId(instrumentId)
    void previewNote(instrumentId, getInstrumentPreviewPitch(instrumentId), 0.78, 0.38)
  }

  return {
    addTrack,
    closeInstrumentDialog,
    confirmInstrumentDialog,
    cycleTrackColor,
    deleteTrack,
    openInstrumentDialog,
    previewInstrumentChoice,
    selectInstrument,
    selectTrack,
    updateTrack,
  }
}
