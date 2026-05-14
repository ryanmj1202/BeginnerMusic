import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from 'react'
import type { HeldPreview } from '../../../lib/audio/toneTransport'
import type { Project } from '../../../types/music'
import type {
  ActivePlaybackTrack,
  KeyboardRecordingNote,
  PlaybackInstrument,
} from '../types'
import type { TempoTimelineSegment } from '../helpers'

export type ActiveAudioNode = {
  gain: GainNode
  panner: StereoPannerNode
  source: AudioScheduledSourceNode
}

export type UsePlaybackOptions = {
  activeAudioElementsRef: MutableRefObject<HTMLAudioElement[]>
  activeAudioNodesRef: MutableRefObject<ActiveAudioNode[]>
  activeInstrumentsRef: MutableRefObject<PlaybackInstrument[]>
  activeIntervalsRef: MutableRefObject<number[]>
  activePlaybackTracksRef: MutableRefObject<ActivePlaybackTrack[]>
  activeTimeoutsRef: MutableRefObject<number[]>
  heldPreviewRef: MutableRefObject<HeldPreview | null>
  isPlaying: boolean
  keyboardInputEnabled: boolean
  keyboardRecordingRef: MutableRefObject<Map<string, KeyboardRecordingNote>>
  keyPreviewRef: MutableRefObject<{ active: boolean }>
  lastPlayheadAutoScrollAtRef: MutableRefObject<number>
  pianoRollRef: MutableRefObject<HTMLDivElement | null>
  playbackBeatRef: MutableRefObject<number>
  playbackPressedPitchCountsRef: MutableRefObject<Map<number, number>>
  playbackSessionRef: MutableRefObject<number>
  playbackStartBeatRef: MutableRefObject<number>
  playbackStartMsRef: MutableRefObject<number>
  playbackStartSecondsRef: MutableRefObject<number>
  playbackTempoTimelineRef: MutableRefObject<TempoTimelineSegment[]>
  projectRef: MutableRefObject<Project>
  setIsPlaying: Dispatch<SetStateAction<boolean>>
  setPlaybackBeat: Dispatch<SetStateAction<number>>
  setPlaybackPosition: (beat: number) => void
  setPressedPitch: Dispatch<SetStateAction<number | null>>
  totalBeats: number
  totalBeatsRef: MutableRefObject<number>
}
