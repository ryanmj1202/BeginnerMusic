import * as Tone from 'tone'
import { useEffect, useRef } from 'react'
import { expandProjectForArrangement } from '../../../lib/arrangement/trackArrangement'
import {
  createInstrument,
  ensureAudioReady,
  isDrumInstrument,
  silenceAllAudioOutput,
  stopAllPreviewAudio,
  stopPreviewNoteImmediately,
  waitForInstrumentReady,
} from '../../../lib/audio/toneTransport'
import type {
  Note,
  Project,
} from '../../../types/music'
import {
  PLAYBACK_LOOKAHEAD_BEATS,
  PLAYBACK_SCHEDULER_MS,
} from '../constants'
import {
  buildTempoTimeline,
  getBeatAtSecondsFromTimeline,
  getSecondsAtBeatFromTimeline,
  getSecondsBetweenBeatsFromTimeline,
} from '../helpers'
import type {
  ActivePlaybackTrack,
  EditableNoteControlKey,
} from '../types'
import { getAutomatedNoteControlValue, getNoteControlAutomation } from '../utils/noteControlUtils'
import { getMinimumPlaybackDrumSeconds } from '../utils/playbackDuration'
import {
  getFirstNoteIndexAtBeat,
  getPlaybackContentEndBeat,
  getPlaybackLoopState,
  getPreparedPlaybackNotes,
} from '../utils/playbackNoteUtils'
import type { UsePlaybackOptions } from './playbackTypes'

type ActiveRoutedNote = {
  instrument: ReturnType<typeof createInstrument>
  note: Note
  pitchShift: Tone.PitchShift | null
  sessionId: number
}

export function usePlayback({
  activeAudioElementsRef,
  activeAudioNodesRef,
  activeInstrumentsRef,
  activeIntervalsRef,
  activePlaybackTracksRef,
  activeTimeoutsRef,
  heldPreviewRef,
  isPlaying,
  keyboardInputEnabled,
  keyboardRecordingRef,
  keyPreviewRef,
  lastPlayheadAutoScrollAtRef,
  pianoRollRef,
  playbackBeatRef,
  playbackPressedPitchCountsRef,
  playbackSessionRef,
  playbackStartBeatRef,
  playbackStartMsRef,
  playbackStartSecondsRef,
  playbackTempoTimelineRef,
  projectRef,
  setIsPlaying,
  setPlaybackBeat,
  setPlaybackPosition,
  setPressedPitch,
  totalBeats,
  totalBeatsRef,
}: UsePlaybackOptions) {
  const activeRoutedNotesRef = useRef<Set<ActiveRoutedNote>>(new Set())

  useEffect(() => {
    if (!isPlaying || activeRoutedNotesRef.current.size === 0) return

    const currentBeat = playbackBeatRef.current
    const notesById = new Map<string, Note>()
    Object.values(projectRef.current.notesByTrack).forEach((notes) => {
      notes.forEach((note) => notesById.set(note.id, note))
    })

    activeRoutedNotesRef.current.forEach((activeNote) => {
      if (activeNote.sessionId !== playbackSessionRef.current) return
      const note = notesById.get(activeNote.note.id)
      if (!note) return

      const beatOffset = currentBeat - note.startBeat
      if (beatOffset < 0 || beatOffset > note.durationBeats) return

      const pitchBend = getAutomatedNoteControlValue(note, 'pitchBend', beatOffset)
      if (activeNote.pitchShift) {
        activeNote.pitchShift.pitch = pitchBend
      } else {
        activeNote.instrument.setPitchBend?.(pitchBend * 100, Tone.now())
      }
    })
  })

  function setManagedPlaybackTimeout(callback: () => void, delayMs: number) {
    const timeoutId = window.setTimeout(() => {
      activeTimeoutsRef.current = activeTimeoutsRef.current.filter((item) => item !== timeoutId)
      callback()
    }, Math.ceil(delayMs))

    activeTimeoutsRef.current.push(timeoutId)
    return timeoutId
  }

  function getLoopPlaybackSeconds(timeline: ReturnType<typeof buildTempoTimeline>, loopLengthBeats: number) {
    const elapsedSeconds = playbackStartSecondsRef.current + (performance.now() - playbackStartMsRef.current) / 1000
    const loopDurationSeconds = Math.max(0.001, getSecondsAtBeatFromTimeline(timeline, loopLengthBeats))

    return {
      cycle: Math.floor(elapsedSeconds / loopDurationSeconds),
      loopDurationSeconds,
      seconds: elapsedSeconds % loopDurationSeconds,
    }
  }

  function replacePlaybackTrackInstrument(track: ActivePlaybackTrack, instrumentId: string) {
    if (track.instrumentId === instrumentId) return

    const previousInstrument = track.instrument
    const previousEffectInstrument = track.effectInstrument
    const nextInstrument = createInstrument(instrumentId)
    if (track.panner) {
      nextInstrument.disconnect?.()
      nextInstrument.connect?.(track.panner)
    }

    track.instrumentId = instrumentId
    track.instrument = nextInstrument
    track.effectInstrument = undefined
    track.isDrum = isDrumInstrument(instrumentId)
    track.scheduledLoopNoteKeys?.clear()
    activeInstrumentsRef.current = activeInstrumentsRef.current.filter((instrument) =>
      instrument !== previousInstrument && instrument !== previousEffectInstrument,
    )
    activeInstrumentsRef.current.push(nextInstrument)
    previousInstrument.triggerRelease(undefined)
    previousInstrument.dispose()
    previousEffectInstrument?.triggerRelease(undefined)
    previousEffectInstrument?.dispose()
    void waitForInstrumentReady(nextInstrument)
  }

  function setPlaybackKeyPressedClass(rawPitch: number, pressed: boolean) {
    const pitch = Math.max(0, Math.min(127, Math.round(rawPitch)))
    pianoRollRef.current
      ?.querySelectorAll<HTMLButtonElement>(`.piano-key[data-pitch="${pitch}"]`)
      .forEach((key) => key.classList.toggle('is-playback-pressed', pressed))
  }

  function markPlaybackPitchPressed(rawPitch: number) {
    const pitch = Math.max(0, Math.min(127, Math.round(rawPitch)))
    const counts = playbackPressedPitchCountsRef.current
    const nextCount = (counts.get(pitch) ?? 0) + 1
    counts.set(pitch, nextCount)
    if (nextCount === 1) {
      setPlaybackKeyPressedClass(pitch, true)
    }
  }

  function markPlaybackPitchReleased(rawPitch: number) {
    const pitch = Math.max(0, Math.min(127, Math.round(rawPitch)))
    const counts = playbackPressedPitchCountsRef.current
    const currentCount = counts.get(pitch) ?? 0

    if (currentCount <= 1) {
      counts.delete(pitch)
      setPlaybackKeyPressedClass(pitch, false)
    } else {
      counts.set(pitch, currentCount - 1)
    }
  }

  function clearPlaybackPressedKeys() {
    pianoRollRef.current
      ?.querySelectorAll<HTMLButtonElement>('.piano-key.is-playback-pressed')
      .forEach((key) => key.classList.remove('is-playback-pressed'))
    playbackPressedPitchCountsRef.current.clear()
  }

  function disposePlaybackVoices() {
    playbackSessionRef.current += 1
    silenceAllAudioOutput()
    stopPreviewNoteImmediately(heldPreviewRef.current)
    heldPreviewRef.current = null
    stopAllPreviewAudio()
    keyPreviewRef.current.active = false
    keyboardRecordingRef.current.forEach((recording) => {
      if (recording.liveNoteInput === null) return
      const track = activePlaybackTracksRef.current.find((item) => item.id === recording.trackId)
      track?.instrument.triggerRelease(recording.liveNoteInput, Tone.now())
    })
    keyboardRecordingRef.current.clear()
    setPressedPitch(null)
    clearPlaybackPressedKeys()
    activeTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
    activeTimeoutsRef.current = []
    activeIntervalsRef.current.forEach((intervalId) => window.clearInterval(intervalId))
    activeIntervalsRef.current = []
    activeAudioElementsRef.current.forEach((audio) => {
      audio.pause()
      audio.src = ''
    })
    activeAudioElementsRef.current = []
    activeAudioNodesRef.current.forEach(({ gain, panner, source }) => {
      try {
        source.stop()
      } catch {
        // Source may have already ended naturally.
      }
      source.disconnect()
      gain.disconnect()
      panner.disconnect()
    })
    activeAudioNodesRef.current = []
    const playbackInstruments = new Set(activeInstrumentsRef.current)
    activePlaybackTracksRef.current.forEach((track) => {
      playbackInstruments.add(track.instrument)
      if (track.effectInstrument) playbackInstruments.add(track.effectInstrument)
      track.panner?.disconnect()
      track.panner?.dispose()
    })
    playbackInstruments.forEach((instrument) => {
      instrument.triggerRelease(undefined)
      instrument.dispose()
    })
    activeInstrumentsRef.current = []
    activePlaybackTracksRef.current = []
    activeRoutedNotesRef.current.clear()
    playbackTempoTimelineRef.current = []
    playbackStartSecondsRef.current = 0
    lastPlayheadAutoScrollAtRef.current = 0
    setIsPlaying(false)
  }

  function schedulePlaybackNote(
    track: ActivePlaybackTrack,
    note: Note,
    currentBeat: number,
    sessionId: number,
    timing?: { delayMs: number; durationSeconds: number },
  ) {
    const timeline = playbackTempoTimelineRef.current.length > 0
      ? playbackTempoTimelineRef.current
      : buildTempoTimeline(projectRef.current, totalBeats)
    const offsetBeat = Math.max(0, currentBeat - note.startBeat)
    const playbackStartBeat = note.startBeat + offsetBeat
    const playbackEndBeat = note.startBeat + note.durationBeats
    const remainingDurationSeconds = timing?.durationSeconds ?? Math.max(
      0.04,
      getSecondsBetweenBeatsFromTimeline(timeline, playbackStartBeat, playbackEndBeat),
    )
    const baseDelayMs = timing?.delayMs ?? Math.max(
      0,
      (getSecondsAtBeatFromTimeline(timeline, note.startBeat) - getSecondsAtBeatFromTimeline(timeline, currentBeat)) * 1000,
    )
    const getNoteValue = (key: EditableNoteControlKey) =>
      getAutomatedNoteControlValue(note, key, offsetBeat)
    const getControlSchedule = (key: EditableNoteControlKey) => [
      {
        beatOffset: offsetBeat,
        value: getNoteValue(key),
      },
      ...getNoteControlAutomation(note, key)
        .filter((point) => point.beatOffset > offsetBeat && point.beatOffset < note.durationBeats),
    ]
    const hasControlGlide = (schedule: { value: number }[]) => schedule.some((point, index) => (
      index > 0 && Math.abs(point.value - schedule[index - 1].value) > 0.001
    ))
    const pitchBendSchedule = [
      {
        beatOffset: offsetBeat,
        value: getNoteValue('pitchBend'),
      },
      ...getNoteControlAutomation(note, 'pitchBend')
        .filter((point) => point.beatOffset > offsetBeat && point.beatOffset < note.durationBeats),
    ]
    const hasPitchGlide = !track.isDrum && pitchBendSchedule.some((point, index) => (
      index > 0 && Math.abs(point.value - pitchBendSchedule[index - 1].value) > 0.001
    ))
    const panSchedule = getControlSchedule('pan')
    const hasPanGlide = hasControlGlide(panSchedule)
    const modulationSchedule = getControlSchedule('modulation')
    const hasModulationGlide = !track.isDrum && hasControlGlide(modulationSchedule)
    const reverbSchedule = getControlSchedule('reverb')
    const hasReverbGlide = !track.isDrum && hasControlGlide(reverbSchedule)
    const hasVelocityAutomation = getNoteControlAutomation(note, 'velocity').length > 0
    const getVelocityValue = (beatOffset: number) => {
      const value = getAutomatedNoteControlValue(note, 'velocity', beatOffset)
      return hasVelocityAutomation ? value * (track.sourceVolume ?? 1) : value
    }
    const gainSchedule = [
      {
        beatOffset: offsetBeat,
        value: getVelocityValue(offsetBeat) * getNoteValue('volume') * getNoteValue('expression'),
      },
      ...[
        ...getNoteControlAutomation(note, 'velocity'),
        ...getNoteControlAutomation(note, 'volume'),
        ...getNoteControlAutomation(note, 'expression'),
      ]
        .filter((point) => point.beatOffset > offsetBeat && point.beatOffset < note.durationBeats)
        .map((point) => ({
          beatOffset: point.beatOffset,
          value:
            getVelocityValue(point.beatOffset) *
            getAutomatedNoteControlValue(note, 'volume', point.beatOffset) *
            getAutomatedNoteControlValue(note, 'expression', point.beatOffset),
        }))
        .sort((left, right) => left.beatOffset - right.beatOffset),
    ]
    const hasGainGlide = gainSchedule.some((point, index) => (
      index > 0 && Math.abs(point.value - gainSchedule[index - 1].value) > 0.001
    ))
    const bentPitch = note.pitch + getNoteValue('pitchBend')
    const noteInput = track.instrument.expectsMidi
      ? (hasPitchGlide ? note.pitch : bentPitch)
      : Tone.Frequency(hasPitchGlide ? note.pitch : bentPitch, 'midi').toFrequency()
    const notePan = Math.max(-1, Math.min(1, panSchedule[0].value))
    const routedPan = Math.max(-1, Math.min(1, (track.pan ?? 0) + notePan))
    const notePitch = note.pitch
    const pitchShiftWindowSize = 0.04
    const pitchShiftLatencySeconds = hasPitchGlide ? pitchShiftWindowSize * 5 : 0
    const routedDuration = track.isDrum
      ? getMinimumPlaybackDrumSeconds(note.pitch, remainingDurationSeconds)
      : remainingDurationSeconds
    const noteModulation = track.isDrum ? 0 : Math.max(0, Math.min(1, modulationSchedule[0].value))
    const noteReverb = track.isDrum ? 0 : Math.max(0, Math.min(1, reverbSchedule[0].value))
    const noteVelocity = Math.max(0.001, hasGainGlide ? 1 : gainSchedule[0].value)
    const needsRouting =
      hasPitchGlide ||
      hasGainGlide ||
      hasPanGlide ||
      hasModulationGlide ||
      hasReverbGlide ||
      Math.abs(notePan) > 0.01 ||
      noteModulation > 0.01 ||
      noteReverb > 0.01
    const routedNoteInstrument = needsRouting
      ? createInstrument(track.instrumentId, 'playback', { isolatedSoundFont: !track.isDrum })
      : null
    const routeReadyStartMs = performance.now()
    const scheduleNoteStart = () => {
      const readyWaitMs = performance.now() - routeReadyStartMs
      const startDelayMs = Math.max(
        0,
        baseDelayMs - readyWaitMs - (hasPitchGlide && offsetBeat <= 0 ? pitchShiftLatencySeconds * 1000 : 0),
      )
      setManagedPlaybackTimeout(() => {
      if (sessionId !== playbackSessionRef.current) return
      markPlaybackPitchPressed(notePitch)

      if (!needsRouting) {
        track.instrument.triggerAttackRelease(
          noteInput,
          routedDuration,
          Tone.now(),
          noteVelocity,
        )
        return
      }

      const gain = hasGainGlide || hasPitchGlide
        ? new Tone.Gain(hasPitchGlide && offsetBeat <= 0 ? 0.0001 : Math.max(0.0001, gainSchedule[0].value)).toDestination()
        : null
      const panner =
        hasPanGlide || Math.abs(notePan) > 0.01
          ? new Tone.Panner(routedPan)
          : null
      panner?.connect(gain ?? Tone.getDestination())
      const vibrato = hasModulationGlide || noteModulation > 0.01
        ? new Tone.Vibrato(6.8, Math.min(0.18, noteModulation * 0.18))
        : null
      const pitchShift = hasPitchGlide
        ? new Tone.PitchShift({ pitch: pitchBendSchedule[0].value, windowSize: pitchShiftWindowSize })
        : null
      const echo = hasReverbGlide || noteReverb > 0.01
        ? new Tone.FeedbackDelay({
          delayTime: 0.06 + noteReverb * 0.16,
          feedback: Math.min(0.62, 0.16 + noteReverb * 0.46),
          wet: Math.min(0.58, 0.18 + noteReverb * 0.4),
        })
        : null
      const noteInstrument = routedNoteInstrument
      {
        if (sessionId !== playbackSessionRef.current || !noteInstrument) {
          panner?.dispose()
          gain?.dispose()
          pitchShift?.dispose()
          vibrato?.dispose()
          echo?.dispose()
          noteInstrument?.dispose()
          return
        }

        if (vibrato) {
          vibrato.wet.value = Math.min(0.55, 0.18 + noteModulation * 0.37)
        }

        const firstEffect = pitchShift ?? vibrato ?? echo ?? panner ?? gain
        if (pitchShift) {
          pitchShift.connect(vibrato ?? echo ?? panner ?? gain ?? Tone.getDestination())
        }

        if (vibrato && echo && panner) {
          echo.connect(panner)
          vibrato.connect(echo)
        } else if (vibrato && echo) {
          echo.connect(gain ?? Tone.getDestination())
          vibrato.connect(echo)
        } else if (vibrato && panner) {
          vibrato.connect(panner)
        } else if (vibrato) {
          vibrato.connect(gain ?? Tone.getDestination())
        } else if (echo && panner) {
          echo.connect(panner)
        } else if (echo) {
          echo.connect(gain ?? Tone.getDestination())
        }

        if (firstEffect) {
          noteInstrument.disconnect?.()
          noteInstrument.connect?.(firstEffect)
        }

        const now = Tone.now()
        const audibleStart = now + (hasPitchGlide && offsetBeat <= 0 ? pitchShiftLatencySeconds : 0)
        if (hasPitchGlide && gain) {
          gain.gain.setValueAtTime(0.0001, now)
          gain.gain.linearRampToValueAtTime(Math.max(0.0001, gainSchedule[0].value), audibleStart + 0.004)
        }
        const getPointTime = (beatOffset: number) => now + getSecondsBetweenBeatsFromTimeline(
          timeline,
          playbackStartBeat,
          note.startBeat + beatOffset,
        )
        const getAudiblePointTime = (beatOffset: number) => audibleStart + getSecondsBetweenBeatsFromTimeline(
          timeline,
          playbackStartBeat,
          note.startBeat + beatOffset,
        )
        const rampNumberParam = (
          param: { linearRampToValueAtTime: (value: number, time: number) => unknown },
          schedule: { beatOffset: number; value: number }[],
          mapValue: (value: number) => number,
        ) => {
          schedule.slice(1).forEach((point) => {
            param.linearRampToValueAtTime(mapValue(point.value), getAudiblePointTime(point.beatOffset))
          })
        }
        if (hasPitchGlide) {
          const pitchTimeouts = new Set<number>()
          let previousPoint = pitchBendSchedule[0]
          pitchBendSchedule.slice(1).forEach((point) => {
            const startMs = Math.max(0, (getPointTime(previousPoint.beatOffset) - now) * 1000)
            const endMs = Math.max(startMs, (getPointTime(point.beatOffset) - now) * 1000)
            const durationMs = Math.max(1, endMs - startMs)
            const steps = Math.max(8, Math.min(48, Math.round(durationMs / 16)))
            for (let index = 1; index <= steps; index += 1) {
              const ratio = index / steps
              const value = previousPoint.value + (point.value - previousPoint.value) * ratio
              const timeoutId = window.setTimeout(() => {
                pitchTimeouts.delete(timeoutId)
                if (sessionId === playbackSessionRef.current && pitchShift) pitchShift.pitch = value
              }, startMs + durationMs * ratio)
              pitchTimeouts.add(timeoutId)
            }
            previousPoint = point
          })
          window.setTimeout(() => {
            pitchTimeouts.forEach((timeoutId) => window.clearTimeout(timeoutId))
          }, (routedDuration + pitchShiftLatencySeconds) * 1000 + 100)
        }
        if (hasPanGlide && panner) {
          rampNumberParam(panner.pan, panSchedule, (value) =>
            Math.max(-1, Math.min(1, (track.pan ?? 0) + value)),
          )
        }
        if (hasModulationGlide && vibrato) {
          rampNumberParam(vibrato.depth, modulationSchedule, (value) =>
            Math.min(0.18, Math.max(0, value) * 0.18),
          )
          rampNumberParam(vibrato.wet, modulationSchedule, (value) =>
            Math.min(0.55, 0.18 + Math.max(0, value) * 0.37),
          )
        }
        if (hasReverbGlide && echo) {
          rampNumberParam(echo.wet, reverbSchedule, (value) =>
            Math.min(0.58, 0.18 + Math.max(0, value) * 0.4),
          )
          rampNumberParam(echo.feedback, reverbSchedule, (value) =>
            Math.min(0.62, 0.16 + Math.max(0, value) * 0.46),
          )
          rampNumberParam(echo.delayTime, reverbSchedule, (value) =>
            0.06 + Math.max(0, value) * 0.16,
          )
        }
        if (hasGainGlide && gain) {
          let previousTime = audibleStart
          gainSchedule.slice(1).forEach((point) => {
            const pointTime = getAudiblePointTime(point.beatOffset)
            gain.gain.linearRampToValueAtTime(Math.max(0.0001, point.value), previousTime + Math.max(0.001, pointTime - previousTime))
            previousTime = pointTime
          })
        }
        if (hasPitchGlide) {
          const sustainSegmentBeats = 2
          const overlapSeconds = 0.12
          let segmentStartBeat = playbackStartBeat
          while (segmentStartBeat < playbackEndBeat) {
            const segmentEndBeat = Math.min(playbackEndBeat, segmentStartBeat + sustainSegmentBeats)
            const segmentDelaySeconds = getSecondsBetweenBeatsFromTimeline(timeline, playbackStartBeat, segmentStartBeat)
            const segmentDurationSeconds =
              getSecondsBetweenBeatsFromTimeline(timeline, segmentStartBeat, segmentEndBeat) +
              (segmentEndBeat < playbackEndBeat ? overlapSeconds : pitchShiftLatencySeconds)
            noteInstrument.triggerAttackRelease(
              noteInput,
              Math.max(0.04, segmentDurationSeconds),
              now + segmentDelaySeconds,
              noteVelocity,
            )
            segmentStartBeat = segmentEndBeat
          }
        } else {
          noteInstrument.triggerAttackRelease(
            noteInput,
            routedDuration,
            now,
            noteVelocity,
          )
        }
        const activeRoutedNote = { instrument: noteInstrument, note, pitchShift, sessionId }
        activeRoutedNotesRef.current.add(activeRoutedNote)
        window.setTimeout(() => {
          activeRoutedNotesRef.current.delete(activeRoutedNote)
          noteInstrument.triggerRelease(undefined)
          noteInstrument.dispose()
          vibrato?.dispose()
          echo?.dispose()
          pitchShift?.dispose()
          panner?.dispose()
          gain?.dispose()
        }, Math.max(160, (routedDuration + pitchShiftLatencySeconds) * 1000 + 450 + noteReverb * 1800))
      }
      }, Math.max(
        0,
        startDelayMs,
      ))
    }

    if (routedNoteInstrument) {
      void waitForInstrumentReady(routedNoteInstrument).then(scheduleNoteStart)
    } else {
      scheduleNoteStart()
    }

    setManagedPlaybackTimeout(() => {
      if (sessionId !== playbackSessionRef.current) return
      markPlaybackPitchReleased(notePitch)
    }, baseDelayMs + remainingDurationSeconds * 1000)
  }

  function schedulePlaybackWindow(currentBeat: number) {
    const windowEndBeat = currentBeat + PLAYBACK_LOOKAHEAD_BEATS
    const sessionId = playbackSessionRef.current

    activePlaybackTracksRef.current.forEach((track) => {
      const notesToSchedule: Note[] = []

      while (track.nextIndex < track.notes.length) {
        const note = track.notes[track.nextIndex]
        if (note.startBeat >= windowEndBeat) break

        if (note.startBeat + note.durationBeats > currentBeat) {
          notesToSchedule.push(note)
        }

        track.nextIndex += 1
      }

      if (notesToSchedule.length === 0) return

      notesToSchedule.forEach((note) => {
        schedulePlaybackNote(track, note, currentBeat, sessionId)
      })
    })
  }

  function syncLoopPlaybackTracks(currentProject: Project, loopLengthBeats: number) {
    const hasSoloTrack = currentProject.tracks.some((item) => item.solo)

    activePlaybackTracksRef.current.forEach((activeTrack) => {
      const sourceTrack = currentProject.tracks.find((track) => track.id === activeTrack.id)
      if (!sourceTrack || sourceTrack.mute || (hasSoloTrack && !sourceTrack.solo)) {
        activeTrack.notes = []
        return
      }

      if (activeTrack.instrumentId !== sourceTrack.instrumentId) {
        replacePlaybackTrackInstrument(activeTrack, sourceTrack.instrumentId)
      }

      activeTrack.isDrum = isDrumInstrument(sourceTrack.instrumentId)
      activeTrack.pan = sourceTrack.pan ?? 0
      const sourceNotes = currentProject.notesByTrack[sourceTrack.id] ?? []
      if (
        activeTrack.sourceNotes === sourceNotes &&
        activeTrack.sourceInstrumentId === sourceTrack.instrumentId &&
        activeTrack.sourceVolume === sourceTrack.volume
      ) {
        return
      }

      activeTrack.notes = getPreparedPlaybackNotes(currentProject, sourceTrack, loopLengthBeats)
      activeTrack.sourceInstrumentId = sourceTrack.instrumentId
      activeTrack.sourceNotes = sourceNotes
      activeTrack.sourceVolume = sourceTrack.volume
    })
  }

  function scheduleLoopPlaybackWindow(sessionId: number, loopLengthBeats: number) {
    const timeline = playbackTempoTimelineRef.current.length > 0
      ? playbackTempoTimelineRef.current
      : buildTempoTimeline(projectRef.current, loopLengthBeats)
    const playbackPosition = getLoopPlaybackSeconds(timeline, loopLengthBeats)
    const currentBeat = getBeatAtSecondsFromTimeline(timeline, playbackPosition.seconds, loopLengthBeats)
    const currentBeatSeconds = getSecondsAtBeatFromTimeline(timeline, currentBeat)
    const windowEndBeat = currentBeat + PLAYBACK_LOOKAHEAD_BEATS
    const windows = [
      {
        cycle: playbackPosition.cycle,
        endBeat: Math.min(loopLengthBeats, windowEndBeat),
        startBeat: currentBeat,
      },
    ]

    if (windowEndBeat > loopLengthBeats) {
      windows.push({
        cycle: playbackPosition.cycle + 1,
        endBeat: Math.min(loopLengthBeats, windowEndBeat - loopLengthBeats),
        startBeat: 0,
      })
    }

    syncLoopPlaybackTracks(projectRef.current, loopLengthBeats)

    activePlaybackTracksRef.current.forEach((track) => {
      const scheduledKeys = track.scheduledLoopNoteKeys ?? new Set<string>()
      track.scheduledLoopNoteKeys = scheduledKeys
      scheduledKeys.forEach((key) => {
        const cycle = Number(key.slice(0, key.indexOf(':')))
        if (cycle < playbackPosition.cycle - 1) scheduledKeys.delete(key)
      })

      windows.forEach((windowRange) => {
        let noteIndex = getFirstNoteIndexAtBeat(track.notes, windowRange.startBeat)

        while (noteIndex < track.notes.length) {
          const note = track.notes[noteIndex]
          if (note.startBeat >= windowRange.endBeat) break
          const noteEndBeat = note.startBeat + note.durationBeats
          const scheduledKey = `${windowRange.cycle}:${note.id}`
          if (scheduledKeys.has(scheduledKey)) {
            noteIndex += 1
            continue
          }
          scheduledKeys.add(scheduledKey)

          const effectiveStartBeat = note.startBeat
          const effectiveEndBeat = Math.min(loopLengthBeats, noteEndBeat)
          const durationSeconds = getSecondsBetweenBeatsFromTimeline(timeline, effectiveStartBeat, effectiveEndBeat)
          if (durationSeconds <= 0) {
            noteIndex += 1
            continue
          }

          const targetBeatSeconds = getSecondsAtBeatFromTimeline(timeline, effectiveStartBeat)
          const delaySeconds =
            (windowRange.cycle - playbackPosition.cycle) * playbackPosition.loopDurationSeconds +
            targetBeatSeconds -
            currentBeatSeconds

          schedulePlaybackNote(
            track,
            { ...note, durationBeats: effectiveEndBeat - effectiveStartBeat, startBeat: effectiveStartBeat },
            currentBeat,
            sessionId,
            {
              delayMs: Math.max(0, delaySeconds * 1000),
              durationSeconds: Math.max(0.04, durationSeconds),
            },
          )
          noteIndex += 1
        }
      })
    })
  }

  function schedulePlaybackAudioClips(currentProject: Project, startBeat: number, sessionId: number) {
    const timeline = playbackTempoTimelineRef.current.length > 0
      ? playbackTempoTimelineRef.current
      : buildTempoTimeline(currentProject, totalBeats)
    const hasSoloTrack = currentProject.tracks.some((item) => item.solo)
    ;(currentProject.audioClips ?? []).forEach((clip) => {
      const track = currentProject.tracks.find((item) => item.id === clip.trackId)
      if (!track || track.mute || (hasSoloTrack && !track.solo)) return
      if (clip.startBeat + clip.durationBeats <= startBeat) return

      const clipOffsetSeconds = Math.max(
        0,
        getSecondsBetweenBeatsFromTimeline(timeline, clip.startBeat, Math.min(startBeat, clip.startBeat + clip.durationBeats)),
      )
      const delayMs = Math.max(
        0,
        (getSecondsAtBeatFromTimeline(timeline, clip.startBeat) - getSecondsAtBeatFromTimeline(timeline, startBeat)) * 1000,
      )
      setManagedPlaybackTimeout(() => {
        if (sessionId !== playbackSessionRef.current) return
        const context = Tone.getContext().rawContext
        void fetch(clip.dataUrl)
          .then((response) => response.arrayBuffer())
          .then((arrayBuffer) => context.decodeAudioData(arrayBuffer))
          .then((buffer) => {
            if (sessionId !== playbackSessionRef.current) return
            const source = context.createBufferSource()
            const gain = context.createGain()
            const panner = context.createStereoPanner()
            const clipDurationSeconds = getSecondsBetweenBeatsFromTimeline(timeline, clip.startBeat, clip.startBeat + clip.durationBeats)
            const playDurationSeconds = Math.min(buffer.duration - clipOffsetSeconds, clipDurationSeconds - clipOffsetSeconds)
            if (playDurationSeconds <= 0) return

            source.buffer = buffer
            gain.gain.setValueAtTime(Math.max(0, Math.min(1.8, clip.volume * track.volume)), context.currentTime)
            panner.pan.setValueAtTime(Math.max(-1, Math.min(1, clip.pan + (track.pan ?? 0))), context.currentTime)
            source.connect(gain)
            gain.connect(panner)
            panner.connect(context.destination)
            activeAudioNodesRef.current.push({ gain, panner, source })
            source.onended = () => {
              source.disconnect()
              gain.disconnect()
              panner.disconnect()
              activeAudioNodesRef.current = activeAudioNodesRef.current.filter((node) => node.source !== source)
            }
            source.start(context.currentTime, clipOffsetSeconds, playDurationSeconds)
          })
          .catch(() => undefined)
      }, delayMs)
    })
  }

  function getLivePlaybackBeat() {
    const elapsedMs = performance.now() - playbackStartMsRef.current
    const project = projectRef.current
    const totalPlaybackBeats = totalBeatsRef.current || totalBeats
    const loopState = getPlaybackLoopState(project, totalPlaybackBeats)
    const playbackTotalBeats = loopState.enabled ? loopState.lengthBeats : totalPlaybackBeats
    const timeline = playbackTempoTimelineRef.current.length > 0
      ? playbackTempoTimelineRef.current
      : buildTempoTimeline(project, playbackTotalBeats)
    const elapsedSeconds = playbackStartSecondsRef.current + elapsedMs / 1000
    const playbackSeconds = loopState.enabled
      ? elapsedSeconds % Math.max(0.001, getSecondsAtBeatFromTimeline(timeline, playbackTotalBeats))
      : elapsedSeconds

    return Math.min(
      playbackTotalBeats,
      getBeatAtSecondsFromTimeline(timeline, playbackSeconds, playbackTotalBeats),
    )
  }

  function getCurrentPlaybackBeat() {
    if (!isPlaying) return playbackBeatRef.current
    return getLivePlaybackBeat()
  }

  function pausePlayback() {
    const currentBeat = getCurrentPlaybackBeat()
    playbackBeatRef.current = currentBeat
    setPlaybackBeat(currentBeat)
    disposePlaybackVoices()
  }

  function resetPlayback() {
    disposePlaybackVoices()
    setPlaybackPosition(0)
  }

  function finishPlayback(endBeat: number) {
    disposePlaybackVoices()
    setPlaybackPosition(endBeat)
  }

  async function startPlaybackAt(startBeat: number) {
    disposePlaybackVoices()
    const sessionId = playbackSessionRef.current
    await ensureAudioReady()
    if (sessionId !== playbackSessionRef.current) return

    const currentProject = projectRef.current
    const loopState = getPlaybackLoopState(currentProject, totalBeats)
    const playbackTotalBeats = loopState.enabled ? loopState.lengthBeats : totalBeats
    const safeStartBeat = loopState.enabled
      ? ((startBeat % playbackTotalBeats) + playbackTotalBeats) % playbackTotalBeats
      : Math.max(0, Math.min(playbackTotalBeats, startBeat))
    const arrangedPlaybackProject = expandProjectForArrangement(currentProject)
    const playbackTimeline = buildTempoTimeline(currentProject, playbackTotalBeats)
    playbackTempoTimelineRef.current = playbackTimeline
    playbackStartSecondsRef.current = getSecondsAtBeatFromTimeline(playbackTimeline, safeStartBeat)
    const hasSoloTrack = currentProject.tracks.some((item) => item.solo)
    const playbackEndBeat = keyboardInputEnabled
      ? playbackTotalBeats
      : Math.max(safeStartBeat, getPlaybackContentEndBeat(arrangedPlaybackProject))

    arrangedPlaybackProject.tracks.forEach((track) => {
      if (track.mute || (hasSoloTrack && !track.solo)) return

      const notes = getPreparedPlaybackNotes(
        arrangedPlaybackProject,
        track,
        loopState.enabled ? playbackTotalBeats : undefined,
      )

      if (!loopState.enabled && notes.length === 0) return

      const instrument = createInstrument(track.instrumentId)
      const hasEffectNotes = notes.some((note) => (
        Math.abs(note.pan ?? 0) > 0.01 ||
        (!isDrumInstrument(track.instrumentId) && getNoteControlAutomation(note, 'pitchBend').length > 0) ||
        (!isDrumInstrument(track.instrumentId) && ((note.modulation ?? 0) > 0.01 || (note.reverb ?? 0) > 0.01))
      ))
      const effectInstrument = hasEffectNotes
        ? createInstrument(track.instrumentId, 'playback', { isolatedSoundFont: !isDrumInstrument(track.instrumentId) })
        : undefined
      const panner =
        Math.abs(track.pan ?? 0) > 0.01
          ? new Tone.Panner(Math.max(-1, Math.min(1, track.pan ?? 0))).toDestination()
          : undefined
      if (panner) {
        instrument.disconnect?.()
        instrument.connect?.(panner)
      }
      activeInstrumentsRef.current.push(instrument)
      if (effectInstrument) activeInstrumentsRef.current.push(effectInstrument)
      activePlaybackTracksRef.current.push({
        effectInstrument,
        id: track.id,
        instrumentId: track.instrumentId,
        instrument,
        isDrum: isDrumInstrument(track.instrumentId),
        notes,
        pan: track.pan ?? 0,
        panner,
        nextIndex: loopState.enabled
          ? 0
          : notes.findIndex((note) => note.startBeat + note.durationBeats > safeStartBeat),
        scheduledLoopNoteKeys: loopState.enabled ? new Set<string>() : undefined,
        sourceInstrumentId: track.instrumentId,
        sourceNotes: arrangedPlaybackProject.notesByTrack[track.id] ?? [],
        sourceVolume: track.volume,
      })
    })

    await Promise.all(
      activePlaybackTracksRef.current.map((track) =>
        Promise.all([
          waitForInstrumentReady(track.instrument),
          track.effectInstrument ? waitForInstrumentReady(track.effectInstrument) : Promise.resolve(),
        ]),
      ),
    )
    if (sessionId !== playbackSessionRef.current) return

    activePlaybackTracksRef.current.forEach((track) => {
      if (track.nextIndex < 0) track.nextIndex = track.notes.length
    })

    if (!loopState.enabled && activePlaybackTracksRef.current.length === 0) {
      setPlaybackPosition(safeStartBeat)
    }

    playbackStartBeatRef.current = safeStartBeat
    playbackStartMsRef.current = performance.now()
    setPlaybackPosition(safeStartBeat)
    setIsPlaying(true)
    if (loopState.enabled) {
      scheduleLoopPlaybackWindow(sessionId, playbackTotalBeats)
      activeIntervalsRef.current.push(
        window.setInterval(() => {
          scheduleLoopPlaybackWindow(sessionId, playbackTotalBeats)
        }, PLAYBACK_SCHEDULER_MS),
      )
      return
    }

    schedulePlaybackAudioClips(arrangedPlaybackProject, safeStartBeat, sessionId)
    schedulePlaybackWindow(safeStartBeat)
    activeIntervalsRef.current.push(
      window.setInterval(() => {
        schedulePlaybackWindow(getLivePlaybackBeat())
      }, PLAYBACK_SCHEDULER_MS),
    )
    activeTimeoutsRef.current.push(
      window.setTimeout(
        () => finishPlayback(playbackEndBeat),
        Math.ceil(getSecondsBetweenBeatsFromTimeline(playbackTimeline, safeStartBeat, playbackEndBeat) * 1000),
      ),
    )
  }

  async function startPlayback() {
    const startBeat = playbackBeatRef.current >= totalBeats ? 0 : playbackBeatRef.current
    await startPlaybackAt(startBeat)
  }

  function togglePlayback() {
    if (isPlaying) {
      pausePlayback()
      return
    }

    void startPlayback()
  }

  return {
    clearPlaybackPressedKeys,
    disposePlaybackVoices,
    getCurrentPlaybackBeat,
    getLivePlaybackBeat,
    getMinimumPlaybackDrumSeconds,
    pausePlayback,
    resetPlayback,
    schedulePlaybackAudioClips,
    schedulePlaybackNote,
    schedulePlaybackWindow,
    startPlayback,
    startPlaybackAt,
    togglePlayback,
  }
}
