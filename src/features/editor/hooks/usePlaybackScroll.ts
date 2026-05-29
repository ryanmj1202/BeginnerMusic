// @ts-nocheck
import { useEffect } from 'react'
import { getWorkstationLoopSettings } from '../../../lib/workstationLoop'
import {
  DEFAULT_BEAT_WIDTH,
  KEY_COLUMN_WIDTH,
  PLAYHEAD_AUTO_SCROLL_THROTTLE_MS,
  PLAYHEAD_SCROLL_PADDING,
} from '../constants'
import {
  buildTempoTimeline,
  getBeatAtSecondsFromTimeline,
  getSecondsAtBeatFromTimeline,
} from '../helpers'

export function usePlaybackScroll(options) {
  const {
    eraseRef,
    isPlaying,
    lassoSelectionRef,
    lastPlayheadAutoScrollAtRef,
    noteDragRef,
    patternRepeatRef,
    patternSelectionRef,
    pianoRollRef,
    playbackBeatRef,
    playbackStartMsRef,
    playbackStartSecondsRef,
    playbackTempoTimelineRef,
    projectRef,
    rightEraseRef,
    rollZoom,
    totalBeatsRef,
  } = options

  useEffect(() => {
    if (!isPlaying) return

    let frameId = 0
    const tick = () => {
      const now = performance.now()
      const totalBeats = Math.max(1, totalBeatsRef.current)
      const loopSettings = getWorkstationLoopSettings(projectRef.current)
      const playbackTotalBeats = loopSettings.enabled
        ? Math.max(1, Math.min(totalBeats, loopSettings.lengthBeats))
        : totalBeats
      const timeline = playbackTempoTimelineRef.current.length > 0
        ? playbackTempoTimelineRef.current
        : buildTempoTimeline(projectRef.current, playbackTotalBeats)
      const elapsedSeconds = playbackStartSecondsRef.current + (now - playbackStartMsRef.current) / 1000
      const loopDurationSeconds = Math.max(0.001, getSecondsAtBeatFromTimeline(timeline, playbackTotalBeats))
      const playbackSeconds = loopSettings.enabled
        ? elapsedSeconds % loopDurationSeconds
        : elapsedSeconds
      const currentBeat = Math.min(
        playbackTotalBeats,
        getBeatAtSecondsFromTimeline(timeline, playbackSeconds, playbackTotalBeats),
      )

      playbackBeatRef.current = currentBeat
      pianoRollRef.current?.style.setProperty('--playhead-left', `${Math.min(100, (currentBeat / totalBeats) * 100)}%`)

      const roll = pianoRollRef.current
      const userIsEditingRoll =
        Boolean(noteDragRef.current?.active) ||
        Boolean(patternSelectionRef.current?.active) ||
        Boolean(patternRepeatRef.current?.active) ||
        lassoSelectionRef.current.active ||
        eraseRef.current.active ||
        rightEraseRef.current.active

      if (
        roll &&
        totalBeats > 0 &&
        !userIsEditingRoll &&
        now - lastPlayheadAutoScrollAtRef.current >= PLAYHEAD_AUTO_SCROLL_THROTTLE_MS
      ) {
        lastPlayheadAutoScrollAtRef.current = now
        const gridWidth = Math.max(totalBeats * DEFAULT_BEAT_WIDTH * rollZoom, roll.scrollWidth - KEY_COLUMN_WIDTH)
        const playheadX = KEY_COLUMN_WIDTH + (currentBeat / totalBeats) * gridWidth
        const viewportLeft = roll.scrollLeft
        const viewportRight = viewportLeft + roll.clientWidth

        if (playheadX > viewportRight - PLAYHEAD_SCROLL_PADDING) {
          roll.scrollLeft = Math.min(roll.scrollWidth - roll.clientWidth, playheadX - roll.clientWidth + PLAYHEAD_SCROLL_PADDING)
        } else if (playheadX < viewportLeft + KEY_COLUMN_WIDTH + PLAYHEAD_SCROLL_PADDING) {
          roll.scrollLeft = Math.max(0, playheadX - KEY_COLUMN_WIDTH - PLAYHEAD_SCROLL_PADDING)
        }
      }

      frameId = window.requestAnimationFrame(tick)
    }

    frameId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frameId)
  }, [isPlaying, rollZoom])
}
