import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from 'react'
import * as Tone from 'tone'
import type { Project, Track } from '../../../types/music'
import type {
  ActivePlaybackTrack,
  KeyboardRecordingNote,
} from '../types'
import type { createInstrument } from '../../../lib/audio/toneTransport'
import type { TempoTimelineSegment } from '../helpers'

export type UseKeyboardRecordingOptions = {
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

export type MidiPerformanceControls = {
  expression: number
  modulation: number
  pan: number
  pitchBend: number
  reverb: number
  sustain: boolean
  volume: number
}

export type LiveMidiVoice = {
  echo: Tone.FeedbackDelay | null
  instrument: ReturnType<typeof createInstrument>
  noteInput: number
  panner: Tone.Panner | null
  trackId: string
  vibrato: Tone.Vibrato | null
}

export const DEFAULT_MIDI_CONTROLS: MidiPerformanceControls = {
  expression: 1,
  modulation: 0,
  pan: 0,
  pitchBend: 0,
  reverb: 0,
  sustain: false,
  volume: 1,
}

export function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

export function clampPan(value: number) {
  return Math.max(-1, Math.min(1, value))
}
