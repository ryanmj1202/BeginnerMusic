import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from 'react'
import * as Tone from 'tone'
import {
  isDrumInstrument,
  previewNote,
} from '../../../lib/audio/toneTransport'
import type {
  Note,
  Project,
  Track,
} from '../../../types/music'
import {
  DRUM_KEYBOARD_PITCHES,
  KEYBOARD_INPUT_CODES,
  KEYBOARD_INPUT_MAP,
  MIN_DURATION_BEATS,
} from '../constants'
import {
  buildTempoTimeline,
  createId,
  getBeatAtSecondsFromTimeline,
  type TempoTimelineSegment,
} from '../helpers'
import type {
  ActivePlaybackTrack,
  KeyboardRecordingNote,
} from '../types'

type UseKeyboardRecordingOptions = {
  activePlaybackTracksRef: MutableRefObject<ActivePlaybackTrack[]>
  getMinimumPlaybackDrumSeconds: (pitch: number, durationSeconds: number) => number
  isPlaying: boolean
  keyboardInputEnabled: boolean
  keyboardRecordingRef: MutableRefObject<Map<string, KeyboardRecordingNote>>
  playbackBeatRef: MutableRefObject<number>
  playbackStartMsRef: MutableRefObject<number>
  playbackStartSecondsRef: MutableRefObject<number>
  playbackTempoTimelineRef: MutableRefObject<TempoTimelineSegment[]>
  projectRef: MutableRefObject<Project>
  selectedTrack: Track | undefined
  setProject: Dispatch<SetStateAction<Project>>
  setSelectedNoteIds: Dispatch<SetStateAction<string[]>>
  totalBeats: number
  totalBeatsRef: MutableRefObject<number>
}

export function useKeyboardRecording({
  activePlaybackTracksRef,
  getMinimumPlaybackDrumSeconds,
  isPlaying,
  keyboardInputEnabled,
  keyboardRecordingRef,
  playbackBeatRef,
  playbackStartMsRef,
  playbackStartSecondsRef,
  playbackTempoTimelineRef,
  projectRef,
  selectedTrack,
  setProject,
  setSelectedNoteIds,
  totalBeats,
  totalBeatsRef,
}: UseKeyboardRecordingOptions) {
  function getKeyboardInputPitch(code: string) {
    const mappedPitch = KEYBOARD_INPUT_MAP[code]
    if (mappedPitch === undefined) return null
    if (!selectedTrack || !isDrumInstrument(selectedTrack.instrumentId)) return mappedPitch

    const drumIndex = KEYBOARD_INPUT_CODES.indexOf(code)
    return DRUM_KEYBOARD_PITCHES[Math.max(0, drumIndex) % DRUM_KEYBOARD_PITCHES.length]
  }

  function getPlaybackBeatAtEventTime(eventTimeStamp?: number) {
    if (!isPlaying) return playbackBeatRef.current

    const now = performance.now()
    const hasValidTimestamp = typeof eventTimeStamp === 'number' && Number.isFinite(eventTimeStamp)
    const eventTime = hasValidTimestamp && Math.abs(now - eventTimeStamp) < 5000
      ? eventTimeStamp
      : now
    const elapsedMs = Math.max(0, eventTime - playbackStartMsRef.current)
    const playbackTotalBeats = totalBeatsRef.current || totalBeats
    const timeline = playbackTempoTimelineRef.current.length > 0
      ? playbackTempoTimelineRef.current
      : buildTempoTimeline(projectRef.current, playbackTotalBeats)
    return getBeatAtSecondsFromTimeline(
      timeline,
      playbackStartSecondsRef.current + elapsedMs / 1000,
      playbackTotalBeats,
    )
  }

  function playLiveKeyboardInput(trackId: string, pitch: number, velocity: number) {
    const track = activePlaybackTracksRef.current.find((item) => item.id === trackId)
    if (!track) return null

    const noteInput = track.instrument.expectsMidi
      ? pitch
      : Tone.Frequency(pitch, 'midi').toFrequency()

    if (track.isDrum) {
      track.instrument.triggerAttackRelease(
        noteInput,
        getMinimumPlaybackDrumSeconds(pitch, MIN_DURATION_BEATS * (60 / projectRef.current.tempo)),
        Tone.now(),
        velocity,
      )
      return null
    }

    track.instrument.triggerAttack(noteInput, Tone.now(), velocity)
    return noteInput
  }

  function startKeyboardNote(code: string, eventTimeStamp?: number) {
    if (!keyboardInputEnabled || !isPlaying || !selectedTrack) return
    if (keyboardRecordingRef.current.has(code)) return

    const pitch = getKeyboardInputPitch(code)
    if (pitch === null) return

    const startBeat = Math.max(0, getPlaybackBeatAtEventTime(eventTimeStamp))
    const liveNoteInput = playLiveKeyboardInput(selectedTrack.id, pitch, 0.78)
    const note: Note = {
      id: createId('note'),
      pitch,
      startBeat,
      durationBeats: MIN_DURATION_BEATS,
      velocity: 0.78,
      pitchBend: 0,
      volume: 1,
      pan: 0,
      expression: 1,
      modulation: 0,
    }

    keyboardRecordingRef.current.set(code, {
      liveNoteInput,
      noteId: note.id,
      pitch,
      startBeat,
      trackId: selectedTrack.id,
    })
    setSelectedNoteIds([note.id])
    setProject((current) => ({
      ...current,
      selectedNoteId: note.id,
      notesByTrack: {
        ...current.notesByTrack,
        [selectedTrack.id]: [...(current.notesByTrack[selectedTrack.id] ?? []), note],
      },
    }))
    if (liveNoteInput === null && !isDrumInstrument(selectedTrack.instrumentId)) {
      void previewNote(selectedTrack.instrumentId, pitch, note.velocity, 0.25)
    }
  }

  function finishKeyboardNote(code: string, eventTimeStamp?: number) {
    const recording = keyboardRecordingRef.current.get(code)
    if (!recording) return

    keyboardRecordingRef.current.delete(code)
    const endBeat = Math.max(
      recording.startBeat + MIN_DURATION_BEATS,
      Math.max(0, getPlaybackBeatAtEventTime(eventTimeStamp)),
    )
    const durationBeats = Math.max(MIN_DURATION_BEATS, endBeat - recording.startBeat)
    if (recording.liveNoteInput !== null) {
      const track = activePlaybackTracksRef.current.find((item) => item.id === recording.trackId)
      track?.instrument.triggerRelease(recording.liveNoteInput, Tone.now())
    }

    setProject((current) => {
      const notes = current.notesByTrack[recording.trackId] ?? []
      return {
        ...current,
        notesByTrack: {
          ...current.notesByTrack,
          [recording.trackId]: notes.map((note) =>
            note.id === recording.noteId
              ? { ...note, durationBeats }
              : note,
          ),
        },
      }
    })
  }

  return {
    finishKeyboardNote,
    getKeyboardInputPitch,
    getPlaybackBeatAtEventTime,
    playLiveKeyboardInput,
    startKeyboardNote,
  }
}
