import * as Tone from 'tone'
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
import { getWorkstationLoopSettings } from '../../../lib/workstationLoop'
import type {
  Note,
  Project,
  Track,
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
} from '../types'
import { getMinimumPlaybackDrumSeconds } from '../utils/playbackDuration'
import type { UsePlaybackOptions } from './playbackTypes'

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
  function setManagedPlaybackTimeout(callback: () => void, delayMs: number) {
    const timeoutId = window.setTimeout(() => {
      activeTimeoutsRef.current = activeTimeoutsRef.current.filter((item) => item !== timeoutId)
      callback()
    }, Math.ceil(delayMs))

    activeTimeoutsRef.current.push(timeoutId)
    return timeoutId
  }

  function getPlaybackLoopState(project: Project, playbackTotalBeats = totalBeats) {
    const settings = getWorkstationLoopSettings(project)
    const lengthBeats = Math.max(1, Math.min(Math.max(1, playbackTotalBeats), settings.lengthBeats))

    return {
      enabled: settings.enabled,
      lengthBeats,
    }
  }

  function getPreparedPlaybackNotes(project: Project, track: Track, loopLengthBeats?: number) {
    return (project.notesByTrack[track.id] ?? [])
      .filter((note) => loopLengthBeats === undefined || (
        note.startBeat < loopLengthBeats &&
        note.startBeat + note.durationBeats > 0
      ))
      .map((note) => {
        const startBeat = loopLengthBeats === undefined
          ? note.startBeat
          : Math.max(0, note.startBeat)
        const durationBeats = loopLengthBeats === undefined
          ? note.durationBeats
          : Math.min(note.durationBeats, Math.max(0, loopLengthBeats - startBeat))

        return {
          ...note,
          durationBeats,
          startBeat,
          pitch: note.pitch + (note.pitchBend ?? 0),
          velocity: note.velocity * (note.volume ?? 1) * (note.expression ?? 1) * track.volume,
        }
      })
      .filter((note) => note.durationBeats > 0)
      .sort((left, right) => left.startBeat - right.startBeat)
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

  function getFirstNoteIndexAtBeat(notes: Note[], beat: number) {
    let low = 0
    let high = notes.length

    while (low < high) {
      const mid = Math.floor((low + high) / 2)
      if (notes[mid].startBeat < beat) {
        low = mid + 1
      } else {
        high = mid
      }
    }

    return low
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
    const delayMs = timing?.delayMs ?? Math.max(
      0,
      (getSecondsAtBeatFromTimeline(timeline, note.startBeat) - getSecondsAtBeatFromTimeline(timeline, currentBeat)) * 1000,
    )
    const bentPitch = note.pitch + (note.pitchBend ?? 0)
    const noteInput = track.instrument.expectsMidi
      ? bentPitch
      : Tone.Frequency(bentPitch, 'midi').toFrequency()
    const notePan = Math.max(-1, Math.min(1, note.pan ?? 0))
    const routedPan = Math.max(-1, Math.min(1, (track.pan ?? 0) + notePan))
    const notePitch = note.pitch
    setManagedPlaybackTimeout(() => {
      if (sessionId !== playbackSessionRef.current) return
      markPlaybackPitchPressed(notePitch)

      const routedDuration = track.isDrum
        ? getMinimumPlaybackDrumSeconds(note.pitch, remainingDurationSeconds)
        : remainingDurationSeconds
      const noteModulation = track.isDrum ? 0 : Math.max(0, Math.min(1, note.modulation ?? 0))
      const noteReverb = track.isDrum ? 0 : Math.max(0, Math.min(1, note.reverb ?? 0))
      const needsRouting = Math.abs(notePan) > 0.01 || noteModulation > 0.01 || noteReverb > 0.01
      if (!needsRouting) {
        track.instrument.triggerAttackRelease(
          noteInput,
          routedDuration,
          Tone.now(),
          note.velocity,
        )
        return
      }

      const panner =
        Math.abs(notePan) > 0.01
          ? new Tone.Panner(routedPan).toDestination()
          : null
      const vibrato = noteModulation > 0.01
        ? new Tone.Vibrato(6.8, Math.min(0.18, noteModulation * 0.18))
        : null
      const echo = noteReverb > 0.01
        ? new Tone.FeedbackDelay({
          delayTime: 0.06 + noteReverb * 0.16,
          feedback: Math.min(0.62, 0.16 + noteReverb * 0.46),
          wet: Math.min(0.58, 0.18 + noteReverb * 0.4),
        })
        : null
      const noteInstrument = createInstrument(track.instrumentId, 'playback', { isolatedSoundFont: !track.isDrum })
      void waitForInstrumentReady(noteInstrument).then(() => {
        if (sessionId !== playbackSessionRef.current) {
          panner?.dispose()
          vibrato?.dispose()
          echo?.dispose()
          noteInstrument.dispose()
          return
        }

        if (vibrato) {
          vibrato.wet.value = Math.min(0.55, 0.18 + noteModulation * 0.37)
        }

        if (vibrato && echo && panner) {
          echo.connect(panner)
          vibrato.connect(echo)
          noteInstrument.disconnect?.()
          noteInstrument.connect?.(vibrato)
        } else if (vibrato && echo) {
          echo.toDestination()
          vibrato.connect(echo)
          noteInstrument.disconnect?.()
          noteInstrument.connect?.(vibrato)
        } else if (vibrato && panner) {
          vibrato.connect(panner)
          noteInstrument.disconnect?.()
          noteInstrument.connect?.(vibrato)
        } else if (vibrato) {
          vibrato.toDestination()
          noteInstrument.disconnect?.()
          noteInstrument.connect?.(vibrato)
        } else if (echo && panner) {
          echo.connect(panner)
          noteInstrument.disconnect?.()
          noteInstrument.connect?.(echo)
        } else if (echo) {
          echo.toDestination()
          noteInstrument.disconnect?.()
          noteInstrument.connect?.(echo)
        } else if (panner) {
          noteInstrument.disconnect?.()
          noteInstrument.connect?.(panner)
        }

        const now = Tone.now()
        noteInstrument.triggerAttackRelease(
          noteInput,
          routedDuration,
          now,
          note.velocity,
        )
        window.setTimeout(() => {
          noteInstrument.triggerRelease(undefined)
          noteInstrument.dispose()
          vibrato?.dispose()
          echo?.dispose()
          panner?.dispose()
        }, Math.max(160, routedDuration * 1000 + 450 + noteReverb * 1800))
      })
    }, delayMs)

    setManagedPlaybackTimeout(() => {
      if (sessionId !== playbackSessionRef.current) return
      markPlaybackPitchReleased(notePitch)
    }, delayMs + remainingDurationSeconds * 1000)
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

  function getPlaybackContentEndBeat(project: Project) {
    const hasSoloTrack = project.tracks.some((item) => item.solo)
    const activeTrackIds = new Set(
      project.tracks
        .filter((track) => !track.mute && (!hasSoloTrack || track.solo))
        .map((track) => track.id),
    )
    const notesEndBeat = Object.entries(project.notesByTrack).reduce((latestEnd, [trackId, notes]) => {
      if (!activeTrackIds.has(trackId)) return latestEnd
      return Math.max(
        latestEnd,
        ...notes.map((note) => note.startBeat + note.durationBeats),
      )
    }, 0)
    const clipsEndBeat = (project.audioClips ?? []).reduce((latestEnd, clip) => {
      if (!activeTrackIds.has(clip.trackId)) return latestEnd
      return Math.max(latestEnd, clip.startBeat + clip.durationBeats)
    }, 0)
    return Math.max(notesEndBeat, clipsEndBeat)
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
