import { BEATS_PER_BAR } from '../constants'
import {
  getBeatAtSecondsFromTimeline,
  getSecondsAtBeatFromTimeline,
} from '../helpers'
import type { TempoTimelineSegment } from '../helpers'
import { scheduleMetronomeClick } from './metronomeAudio'

const METRONOME_LOOKAHEAD_SECONDS = 0.16
const METRONOME_BEAT_EPSILON = 0.0001

type ScheduleMetronomeWindowOptions = {
  audioContext: BaseAudioContext
  currentAudioTime: number
  playbackSeconds: number
  scheduledBeatRef: { current: number }
  timeline: TempoTimelineSegment[]
  totalBeats: number
  volume: number
}

// Schedules metronome beats against AudioContext time while deriving beat positions from the playback timeline.
export function scheduleMetronomeWindow({
  audioContext,
  currentAudioTime,
  playbackSeconds,
  scheduledBeatRef,
  timeline,
  totalBeats,
  volume,
}: ScheduleMetronomeWindowOptions) {
  if (timeline.length === 0 || totalBeats <= 0) return

  const currentBeat = getBeatAtSecondsFromTimeline(timeline, playbackSeconds, totalBeats)
  const firstBeat = Math.max(0, Math.ceil(currentBeat - METRONOME_BEAT_EPSILON))
  const nextBeat = Math.max(firstBeat, scheduledBeatRef.current)
  const scheduleUntilSeconds = playbackSeconds + METRONOME_LOOKAHEAD_SECONDS
  let beat = nextBeat

  while (beat <= totalBeats) {
    const beatSeconds = getSecondsAtBeatFromTimeline(timeline, beat)
    if (beatSeconds > scheduleUntilSeconds) break

    if (beatSeconds >= playbackSeconds - METRONOME_BEAT_EPSILON) {
      const audioTime = currentAudioTime + Math.max(0, beatSeconds - playbackSeconds)
      scheduleMetronomeClick(audioContext, audioTime, beat % BEATS_PER_BAR === 0, volume)
    }

    beat += 1
  }

  scheduledBeatRef.current = beat
}
