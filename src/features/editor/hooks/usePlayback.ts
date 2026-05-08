import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from 'react'
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
  type HeldPreview,
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
  type TempoTimelineSegment,
} from '../helpers'
import type {
  ActivePlaybackTrack,
  KeyboardRecordingNote,
  PlaybackInstrument,
} from '../types'

type ActiveAudioNode = {
  gain: GainNode
  panner: StereoPannerNode
  source: AudioScheduledSourceNode
}

type UsePlaybackOptions = {
  activeAudioElementsRef: MutableRefObject<HTMLAudioElement[]>
  activeAudioNodesRef: MutableRefObject<ActiveAudioNode[]>
  activeInstrumentsRef: MutableRefObject<PlaybackInstrument[]>
  activeIntervalsRef: MutableRefObject<number[]>
  activePlaybackTracksRef: MutableRefObject<ActivePlaybackTrack[]>
  activeTimeoutsRef: MutableRefObject<number[]>
  heldPreviewRef: MutableRefObject<HeldPreview | null>
  isPlaying: boolean
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

export function usePlayback({
  activeAudioElementsRef,
  activeAudioNodesRef,
  activeInstrumentsRef,
  activeIntervalsRef,
  activePlaybackTracksRef,
  activeTimeoutsRef,
  heldPreviewRef,
  isPlaying,
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
    activePlaybackTracksRef.current.forEach((track) => {
      track.panner?.disconnect()
      track.panner?.dispose()
    })
    activeInstrumentsRef.current.forEach((instrument) => {
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

  function getMinimumPlaybackDrumSeconds(pitch: number, durationSeconds: number) {
    if (pitch === 35 || pitch === 36) return Math.max(durationSeconds, 0.32)
    if (pitch === 38 || pitch === 39 || pitch === 40) return Math.max(durationSeconds, 0.42)
    if (pitch === 42 || pitch === 44) return Math.max(durationSeconds, 0.18)
    if (pitch === 46) return Math.max(durationSeconds, 0.55)
    if (pitch >= 41 && pitch <= 50) return Math.max(durationSeconds, 0.44)
    if (pitch === 49 || pitch === 51 || pitch === 52 || pitch === 55 || pitch === 57 || pitch === 59) {
      return Math.max(durationSeconds, 0.9)
    }
    if (pitch >= 65 && pitch <= 81) return Math.max(durationSeconds, 0.36)
    return Math.max(durationSeconds, 0.28)
  }

  function schedulePlaybackNote(
    track: ActivePlaybackTrack,
    note: Note,
    currentBeat: number,
    sessionId: number,
  ) {
    const timeline = playbackTempoTimelineRef.current.length > 0
      ? playbackTempoTimelineRef.current
      : buildTempoTimeline(projectRef.current, totalBeats)
    const offsetBeat = Math.max(0, currentBeat - note.startBeat)
    const playbackStartBeat = note.startBeat + offsetBeat
    const playbackEndBeat = note.startBeat + note.durationBeats
    const remainingDurationSeconds = Math.max(
      0.04,
      getSecondsBetweenBeatsFromTimeline(timeline, playbackStartBeat, playbackEndBeat),
    )
    const delayMs = Math.max(
      0,
      (getSecondsAtBeatFromTimeline(timeline, note.startBeat) - getSecondsAtBeatFromTimeline(timeline, currentBeat)) * 1000,
    )
    const noteInput = track.instrument.expectsMidi
      ? note.pitch
      : Tone.Frequency(note.pitch, 'midi').toFrequency()
    const notePan = Math.max(-1, Math.min(1, note.pan ?? 0))
    const routedPan = Math.max(-1, Math.min(1, (track.pan ?? 0) + notePan))
    const notePitch = note.pitch
    const startTimeoutId = window.setTimeout(() => {
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
    }, Math.ceil(delayMs))

    activeTimeoutsRef.current.push(startTimeoutId)
    const releaseTimeoutId = window.setTimeout(() => {
      if (sessionId !== playbackSessionRef.current) return
      markPlaybackPitchReleased(notePitch)
    }, Math.ceil(delayMs + remainingDurationSeconds * 1000))
    activeTimeoutsRef.current.push(releaseTimeoutId)
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
      const timeoutId = window.setTimeout(() => {
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
      }, Math.ceil(delayMs))
      activeTimeoutsRef.current.push(timeoutId)
    })
  }

  function getLivePlaybackBeat() {
    const elapsedMs = performance.now() - playbackStartMsRef.current
    const playbackTotalBeats = totalBeatsRef.current || totalBeats
    const timeline = playbackTempoTimelineRef.current.length > 0
      ? playbackTempoTimelineRef.current
      : buildTempoTimeline(projectRef.current, playbackTotalBeats)
    return Math.min(
      playbackTotalBeats,
      getBeatAtSecondsFromTimeline(timeline, playbackStartSecondsRef.current + elapsedMs / 1000, playbackTotalBeats),
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

    const safeStartBeat = Math.max(0, Math.min(totalBeats, startBeat))
    const currentProject = projectRef.current
    const arrangedPlaybackProject = expandProjectForArrangement(currentProject)
    const playbackTimeline = buildTempoTimeline(currentProject, totalBeats)
    playbackTempoTimelineRef.current = playbackTimeline
    playbackStartSecondsRef.current = getSecondsAtBeatFromTimeline(playbackTimeline, safeStartBeat)
    const hasSoloTrack = currentProject.tracks.some((item) => item.solo)
    const playbackEndBeat = Math.max(safeStartBeat, getPlaybackContentEndBeat(arrangedPlaybackProject))

    arrangedPlaybackProject.tracks.forEach((track) => {
      if (track.mute || (hasSoloTrack && !track.solo)) return

      const notes = (arrangedPlaybackProject.notesByTrack[track.id] ?? [])
        .map((note) => ({
          ...note,
          pitch: note.pitch + (note.pitchBend ?? 0),
          velocity: note.velocity * (note.volume ?? 1) * (note.expression ?? 1) * track.volume,
        }))
        .sort((left, right) => left.startBeat - right.startBeat)

      if (notes.length === 0) return

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
        nextIndex: notes.findIndex((note) => note.startBeat + note.durationBeats > safeStartBeat),
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

    if (activePlaybackTracksRef.current.length === 0) {
      setPlaybackPosition(safeStartBeat)
    }

    playbackStartBeatRef.current = safeStartBeat
    playbackStartMsRef.current = performance.now()
    setPlaybackPosition(safeStartBeat)
    setIsPlaying(true)
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
