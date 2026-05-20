import { useEffect, useRef } from 'react'
import * as Tone from 'tone'
import type { MutableRefObject } from 'react'
import type { Project } from '../../../types/music'
import { buildTempoTimeline } from '../helpers'
import type { TempoTimelineSegment } from '../helpers'
import { scheduleMetronomeWindow } from '../utils/metronomeScheduler'

const METRONOME_SCHEDULER_MS = 35

type UseMetronomeOptions = {
  enabled: boolean
  isPlaying: boolean
  playbackStartMsRef: MutableRefObject<number>
  playbackStartSecondsRef: MutableRefObject<number>
  playbackTempoTimelineRef: MutableRefObject<TempoTimelineSegment[]>
  projectRef: MutableRefObject<Project>
  totalBeats: number
  totalBeatsRef: MutableRefObject<number>
  volume: number
}

// Runs a low-jitter metronome scheduler using the shared raw Web Audio context.
export function useMetronome({
  enabled,
  isPlaying,
  playbackStartMsRef,
  playbackStartSecondsRef,
  playbackTempoTimelineRef,
  projectRef,
  totalBeats,
  totalBeatsRef,
  volume,
}: UseMetronomeOptions) {
  const scheduledBeatRef = useRef(0)

  useEffect(() => {
    scheduledBeatRef.current = 0
  }, [enabled, isPlaying, playbackStartMsRef.current, playbackStartSecondsRef.current])

  useEffect(() => {
    if (!enabled || !isPlaying) return undefined

    let timeoutId = 0
    let cancelled = false

    const schedule = () => {
      if (cancelled) return
      const audioContext = Tone.getContext().rawContext
      const playbackTotalBeats = Math.max(1, totalBeatsRef.current || totalBeats)
      const timeline = playbackTempoTimelineRef.current.length > 0
        ? playbackTempoTimelineRef.current
        : buildTempoTimeline(projectRef.current, playbackTotalBeats)
      const playbackSeconds = playbackStartSecondsRef.current +
        Math.max(0, performance.now() - playbackStartMsRef.current) / 1000

      scheduleMetronomeWindow({
        audioContext,
        currentAudioTime: audioContext.currentTime,
        playbackSeconds,
        scheduledBeatRef,
        timeline,
        totalBeats: playbackTotalBeats,
        volume,
      })

      timeoutId = window.setTimeout(schedule, METRONOME_SCHEDULER_MS)
    }

    schedule()

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
      scheduledBeatRef.current = 0
    }
  }, [enabled, isPlaying, projectRef, totalBeats, totalBeatsRef, volume])
}
