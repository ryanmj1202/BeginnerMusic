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

function getRollGridWidth(roll, totalBeats, rollZoom) {
  const cssGridWidth = Number.parseFloat(getComputedStyle(roll).getPropertyValue('--roll-grid-width'))
  return Number.isFinite(cssGridWidth) && cssGridWidth > 0
    ? cssGridWidth
    : Math.max(totalBeats * DEFAULT_BEAT_WIDTH * rollZoom, roll.clientWidth - KEY_COLUMN_WIDTH)
}

function updatePlayheadStyle(roll, beat, totalBeats, gridWidth) {
  const progress = totalBeats > 0 ? Math.max(0, Math.min(1, beat / totalBeats)) : 0
  const x = progress * gridWidth

  roll.querySelector('.roll-playhead')?.style.setProperty('transform', `translate3d(${x - 0.5}px, 0, 0)`)
  roll.querySelector('.timeline-seek-handle')?.style.setProperty('transform', `translate3d(${x}px, 0, 0) translateX(-50%)`)
  roll.querySelector('.timeline-seek-fill')?.style.setProperty('transform', `scaleX(${progress})`)

  return { gridWidth, progress }
}

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
    setPlaybackBeat,
    totalBeatsRef,
  } = options

  useEffect(() => {
    if (!isPlaying) return

    let frameId = 0
    let lastStateBeatUpdateAt = 0
    let cachedRoll = pianoRollRef.current
    let cachedTotalBeats = Math.max(1, totalBeatsRef.current)
    let cachedGridWidth = cachedRoll
      ? getRollGridWidth(cachedRoll, cachedTotalBeats, rollZoom)
      : 0
    const tick = () => {
      const now = performance.now()
      const totalBeats = Math.max(1, totalBeatsRef.current)
      const roll = pianoRollRef.current
      if (roll !== cachedRoll || totalBeats !== cachedTotalBeats) {
        cachedRoll = roll
        cachedTotalBeats = totalBeats
        cachedGridWidth = roll ? getRollGridWidth(roll, totalBeats, rollZoom) : 0
      }
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
      if (typeof setPlaybackBeat === 'function' && now - lastStateBeatUpdateAt >= 33) {
        lastStateBeatUpdateAt = now
        setPlaybackBeat(currentBeat)
      }

      const playheadStyle = roll
        ? updatePlayheadStyle(roll, currentBeat, totalBeats, cachedGridWidth)
        : null
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
        const gridWidth = playheadStyle?.gridWidth ?? cachedGridWidth
        const playheadX = KEY_COLUMN_WIDTH + (playheadStyle?.progress ?? currentBeat / totalBeats) * gridWidth
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
