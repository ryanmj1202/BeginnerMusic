import { useEffect, useRef } from 'react'
import * as Tone from 'tone'
import {
  createInstrument,
  isDrumInstrument,
  waitForInstrumentReady,
} from '../../../lib/audio/toneTransport'
import { getWorkstationLoopSettings } from '../../../lib/workstationLoop'
import type {
  Note,
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
  getSecondsAtBeatFromTimeline,
} from '../helpers'
import type {
  KeyboardRecordingNote,
} from '../types'
import {
  clamp01,
  clampPan,
  DEFAULT_MIDI_CONTROLS,
  type LiveMidiVoice,
  type MidiPerformanceControls,
  type UseKeyboardRecordingOptions,
} from './keyboardRecordingTypes'
import { useMidiInput } from './useMidiInput'

const MIDI_CONTROL_UPDATE_EPSILON = 0.01
const MIDI_LIVE_RESTART_INTERVAL_MS = 90
const MIDI_PITCH_BEND_EPSILON = 0.04

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
  const midiControlsRef = useRef(new Map<number, MidiPerformanceControls>())
  const lastMidiLiveRestartAtRef = useRef(new Map<number, number>())
  const liveMidiInstrumentsRef = useRef(new Map<string, ReturnType<typeof createInstrument>>())
  const liveMidiVoicesRef = useRef(new Map<string, LiveMidiVoice>())
  const pendingMidiControlUpdatesRef = useRef(new Map<number, Partial<Note>>())
  const pendingMidiLiveRestartTimeoutsRef = useRef(new Map<number, number>())
  const midiControlUpdateFrameRef = useRef<number | null>(null)
  const selectedTrackRef = useRef<Track | undefined>(selectedTrack)

  selectedTrackRef.current = selectedTrack

  function getMidiControls(channel: number) {
    const controls = midiControlsRef.current.get(channel)
    if (controls) return controls

    const nextControls = { ...DEFAULT_MIDI_CONTROLS }
    midiControlsRef.current.set(channel, nextControls)
    return nextControls
  }

  function getMidiTargetTrack(channel?: number) {
    if (channel !== undefined) {
      const channelTrack = projectRef.current.tracks.find((track) => track.kind !== 'audio' && track.channel === channel + 1)
      if (channelTrack) return channelTrack
    }

    return selectedTrackRef.current
  }

  function getKeyboardInputPitch(code: string) {
    const mappedPitch = KEYBOARD_INPUT_MAP[code]
    if (mappedPitch === undefined) return null
    const currentTrack = getMidiTargetTrack()
    if (!currentTrack || !isDrumInstrument(currentTrack.instrumentId)) return mappedPitch

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
    const fullPlaybackBeats = totalBeatsRef.current || totalBeats
    const loopSettings = getWorkstationLoopSettings(projectRef.current)
    const playbackTotalBeats = loopSettings.enabled
      ? Math.max(1, Math.min(fullPlaybackBeats, loopSettings.lengthBeats))
      : fullPlaybackBeats
    const timeline = playbackTempoTimelineRef.current.length > 0
      ? playbackTempoTimelineRef.current
      : buildTempoTimeline(projectRef.current, playbackTotalBeats)
    const elapsedSeconds = playbackStartSecondsRef.current + elapsedMs / 1000
    const playbackSeconds = loopSettings.enabled
      ? elapsedSeconds % Math.max(0.001, getSecondsAtBeatFromTimeline(timeline, playbackTotalBeats))
      : elapsedSeconds
    const beat = getBeatAtSecondsFromTimeline(
      timeline,
      playbackSeconds,
      playbackTotalBeats,
    )

    return loopSettings.enabled && beat >= playbackTotalBeats ? 0 : beat
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

  function applyProgramChangeToPlaybackTrack(trackId: string, instrumentId: string) {
    const playbackTrack = activePlaybackTracksRef.current.find((item) => item.id === trackId)
    if (!playbackTrack || playbackTrack.instrumentId === instrumentId) return

    const previousInstrument = playbackTrack.instrument
    const previousEffectInstrument = playbackTrack.effectInstrument
    const nextInstrument = createInstrument(instrumentId)
    if (playbackTrack.panner) {
      nextInstrument.disconnect?.()
      nextInstrument.connect?.(playbackTrack.panner)
    }

    playbackTrack.instrumentId = instrumentId
    playbackTrack.instrument = nextInstrument
    playbackTrack.effectInstrument = undefined
    playbackTrack.isDrum = isDrumInstrument(instrumentId)
    playbackTrack.scheduledLoopNoteKeys?.clear()
    previousInstrument.triggerRelease(undefined, Tone.now())
    previousInstrument.dispose()
    previousEffectInstrument?.triggerRelease(undefined, Tone.now())
    previousEffectInstrument?.dispose()
    void waitForInstrumentReady(nextInstrument)
  }

  function getSharedLiveMidiKey(track: Track, controls: MidiPerformanceControls) {
    const hasPerNoteRouting =
      Math.abs(controls.pan) > 0.01 ||
      controls.modulation > 0.01 ||
      controls.reverb > 0.01

    return hasPerNoteRouting ? null : `${track.id}:${track.instrumentId}`
  }

  function disposeSharedLiveMidiInstrument(sharedKey: string) {
    const instrument = liveMidiInstrumentsRef.current.get(sharedKey)
    if (!instrument) return

    instrument.triggerRelease(undefined, Tone.now())
    instrument.dispose()
    liveMidiInstrumentsRef.current.delete(sharedKey)
  }

  function disposeSharedLiveMidiInstrumentsForTrack(trackId: string) {
    Array.from(liveMidiInstrumentsRef.current.keys())
      .filter((sharedKey) => sharedKey.startsWith(`${trackId}:`))
      .forEach(disposeSharedLiveMidiInstrument)
  }

  function disposeAllSharedLiveMidiInstruments() {
    Array.from(liveMidiInstrumentsRef.current.keys()).forEach(disposeSharedLiveMidiInstrument)
  }

  function createLiveMidiVoice(
    code: string,
    pitch: number,
    velocity: number,
    controls: MidiPerformanceControls,
    channel?: number,
    stopOtherTrackVoices = true,
  ) {
    const currentTrack = getMidiTargetTrack(channel)
    if (!currentTrack) return null
    stopLiveMidiVoice(code, true)
    if (stopOtherTrackVoices) {
      liveMidiVoicesRef.current.forEach((voice, voiceCode) => {
        if (voice.trackId !== currentTrack.id) stopLiveMidiVoice(voiceCode, true)
      })
    }

    const bentPitch = pitch + controls.pitchBend
    const sharedKey = getSharedLiveMidiKey(currentTrack, controls)

    if (sharedKey) {
      const sharedInstrument = liveMidiInstrumentsRef.current.get(sharedKey) ??
        createInstrument(currentTrack.instrumentId, 'preview', { isolatedSoundFont: !isDrumInstrument(currentTrack.instrumentId) })
      if (!liveMidiInstrumentsRef.current.has(sharedKey)) {
        liveMidiInstrumentsRef.current.set(sharedKey, sharedInstrument)
      }
      const noteInput = sharedInstrument.expectsMidi
        ? bentPitch
        : Tone.Frequency(bentPitch, 'midi').toFrequency()

      const liveVoice: LiveMidiVoice = {
        echo: null,
        instrument: sharedInstrument,
        noteInput,
        panner: null,
        sharedKey,
        trackId: currentTrack.id,
        vibrato: null,
      }
      liveMidiVoicesRef.current.set(code, liveVoice)

      void waitForInstrumentReady(sharedInstrument).then(() => {
        if (liveMidiVoicesRef.current.get(code) !== liveVoice) return
        sharedInstrument.triggerAttack(noteInput, Tone.now(), velocity * controls.volume * controls.expression)
      })

      return null
    }

    const instrument = createInstrument(currentTrack.instrumentId, 'preview', { isolatedSoundFont: !isDrumInstrument(currentTrack.instrumentId) })
    const noteInput = instrument.expectsMidi
      ? bentPitch
      : Tone.Frequency(bentPitch, 'midi').toFrequency()
    const panner = Math.abs(controls.pan) > 0.01 ? new Tone.Panner(controls.pan).toDestination() : null
    const vibrato = controls.modulation > 0.01
      ? new Tone.Vibrato(6.8, Math.min(0.18, controls.modulation * 0.18))
      : null
    const echo = controls.reverb > 0.01
      ? new Tone.FeedbackDelay({
        delayTime: 0.06 + controls.reverb * 0.16,
        feedback: Math.min(0.62, 0.16 + controls.reverb * 0.46),
        wet: Math.min(0.58, 0.18 + controls.reverb * 0.4),
      })
      : null

    const liveVoice: LiveMidiVoice = { echo, instrument, noteInput, panner, trackId: currentTrack.id, vibrato }
    liveMidiVoicesRef.current.set(code, liveVoice)

    void waitForInstrumentReady(instrument).then(() => {
      const currentVoice = liveMidiVoicesRef.current.get(code)
      if (currentVoice !== liveVoice) {
        instrument.dispose()
        panner?.dispose()
        vibrato?.dispose()
        echo?.dispose()
        return
      }

      if (vibrato) vibrato.wet.value = Math.min(0.55, 0.18 + controls.modulation * 0.37)
      if (vibrato && echo && panner) {
        echo.connect(panner)
        vibrato.connect(echo)
        instrument.disconnect?.()
        instrument.connect?.(vibrato)
      } else if (vibrato && echo) {
        echo.toDestination()
        vibrato.connect(echo)
        instrument.disconnect?.()
        instrument.connect?.(vibrato)
      } else if (vibrato && panner) {
        vibrato.connect(panner)
        instrument.disconnect?.()
        instrument.connect?.(vibrato)
      } else if (vibrato) {
        vibrato.toDestination()
        instrument.disconnect?.()
        instrument.connect?.(vibrato)
      } else if (echo && panner) {
        echo.connect(panner)
        instrument.disconnect?.()
        instrument.connect?.(echo)
      } else if (echo) {
        echo.toDestination()
        instrument.disconnect?.()
        instrument.connect?.(echo)
      } else if (panner) {
        instrument.disconnect?.()
        instrument.connect?.(panner)
      }

      instrument.triggerAttack(noteInput, Tone.now(), velocity * controls.volume * controls.expression)
    })

    return null
  }

  function stopLiveMidiVoice(code: string, immediate = false) {
    const liveVoice = liveMidiVoicesRef.current.get(code)
    if (!liveVoice) return

    liveMidiVoicesRef.current.delete(code)
    liveVoice.instrument.triggerRelease(liveVoice.noteInput, Tone.now())
    if (liveVoice.sharedKey) return

    if (immediate) {
      liveVoice.instrument.dispose()
      liveVoice.panner?.dispose()
      liveVoice.vibrato?.dispose()
      liveVoice.echo?.dispose()
      return
    }

    window.setTimeout(() => {
      liveVoice.instrument.dispose()
      liveVoice.panner?.dispose()
      liveVoice.vibrato?.dispose()
      liveVoice.echo?.dispose()
    }, 700)
  }

  function stopLiveMidiVoicesForChannel(channel: number, immediate = false) {
    keyboardRecordingRef.current.forEach((recording, code) => {
      if (recording.channel !== channel) return
      stopLiveMidiVoice(code, immediate)
      keyboardRecordingRef.current.delete(code)
    })
  }

  function getHeldDurationBeats(recording: KeyboardRecordingNote, eventTimeStamp?: number) {
    if (recording.eventStartMs !== undefined) {
      return ((performance.now() - recording.eventStartMs) / 1000) * (projectRef.current.tempo / 60)
    }

    return Math.max(0, getPlaybackBeatAtEventTime(eventTimeStamp) - recording.startBeat)
  }

  function updateActiveDurations() {
    if (isPlaying && getWorkstationLoopSettings(projectRef.current).enabled) return

    const updatesByTrack = new Map<string, Map<string, number>>()

    keyboardRecordingRef.current.forEach((recording) => {
      if (recording.releaseTimeStamp !== undefined) return
      const durationBeats = Math.max(MIN_DURATION_BEATS, getHeldDurationBeats(recording))
      const trackUpdates = updatesByTrack.get(recording.trackId) ?? new Map<string, number>()
      trackUpdates.set(recording.noteId, durationBeats)
      updatesByTrack.set(recording.trackId, trackUpdates)
    })

    if (updatesByTrack.size === 0) return

    setProject((current) => ({
      ...current,
      notesByTrack: Object.fromEntries(Object.entries(current.notesByTrack).map(([trackId, notes]) => {
        const trackUpdates = updatesByTrack.get(trackId)
        if (!trackUpdates) return [trackId, notes]

        return [trackId, notes.map((note) => {
          const durationBeats = trackUpdates.get(note.id)
          return durationBeats === undefined ? note : { ...note, durationBeats }
        })]
      })),
    }))
  }

  function startRecordedNote(code: string, pitch: number, velocity: number, eventTimeStamp?: number, channel?: number) {
    const currentTrack = getMidiTargetTrack(channel)
    if (!keyboardInputEnabled || !currentTrack) return
    if (keyboardRecordingRef.current.has(code)) return

    const controls = channel === undefined ? DEFAULT_MIDI_CONTROLS : getMidiControls(channel)
    const startBeat = Math.max(0, getPlaybackBeatAtEventTime(eventTimeStamp))
    const liveNoteInput = channel === undefined
      ? createLiveMidiVoice(code, pitch, velocity, controls, undefined, false)
      : createLiveMidiVoice(code, pitch, velocity, controls, channel)
    const note: Note = {
      id: createId('note'),
      pitch,
      startBeat,
      durationBeats: MIN_DURATION_BEATS,
      velocity,
      pitchBend: controls.pitchBend,
      modulation: controls.modulation,
      volume: controls.volume,
      pan: controls.pan,
      expression: controls.expression,
      reverb: controls.reverb,
    }

    keyboardRecordingRef.current.set(code, {
      channel,
      eventStartMs: isPlaying && !getWorkstationLoopSettings(projectRef.current).enabled ? undefined : performance.now(),
      liveNoteInput,
      noteId: note.id,
      pitch,
      startBeat,
      trackId: currentTrack.id,
      velocity,
    })
    setSelectedNoteIds([note.id])
    setProject((current) => ({
      ...current,
      selectedNoteId: note.id,
      notesByTrack: {
        ...current.notesByTrack,
        [currentTrack.id]: [...(current.notesByTrack[currentTrack.id] ?? []), note],
      },
    }))
  }

  function startKeyboardNote(code: string, eventTimeStamp?: number) {
    const pitch = getKeyboardInputPitch(code)
    if (pitch === null) return

    startRecordedNote(code, pitch, 0.78, eventTimeStamp)
  }

  function finishKeyboardNote(code: string, eventTimeStamp?: number) {
    const recording = keyboardRecordingRef.current.get(code)
    if (!recording) return
    if (recording.channel !== undefined && getMidiControls(recording.channel).sustain) {
      recording.releaseTimeStamp = eventTimeStamp ?? performance.now()
      updateActiveDurations()
      return
    }

    keyboardRecordingRef.current.delete(code)
    const stoppedDurationBeats = getHeldDurationBeats(recording, eventTimeStamp)
    const endBeat = Math.max(
      recording.startBeat + MIN_DURATION_BEATS,
      recording.eventStartMs === undefined
        ? Math.max(0, getPlaybackBeatAtEventTime(eventTimeStamp))
        : recording.startBeat + stoppedDurationBeats,
    )
    const durationBeats = Math.max(MIN_DURATION_BEATS, endBeat - recording.startBeat)
    if (recording.liveNoteInput !== null) {
      const track = activePlaybackTracksRef.current.find((item) => item.id === recording.trackId)
      track?.instrument.triggerRelease(recording.liveNoteInput, Tone.now())
    }
    stopLiveMidiVoice(code)

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

  function startMidiNote(channel: number, pitch: number, velocity: number, eventTimeStamp?: number) {
    startRecordedNote(`midi:${channel}:${pitch}`, pitch, velocity, eventTimeStamp, channel)
  }

  function finishMidiNote(channel: number, pitch: number, eventTimeStamp?: number) {
    finishKeyboardNote(`midi:${channel}:${pitch}`, eventTimeStamp)
  }

  function flushPendingMidiControlUpdates() {
    midiControlUpdateFrameRef.current = null
    const pendingUpdates = pendingMidiControlUpdatesRef.current
    if (pendingUpdates.size === 0) return

    pendingMidiControlUpdatesRef.current = new Map()
    setProject((current) => {
      let changed = false
      const updatesByNote = new Map<string, Partial<Note>>()

      keyboardRecordingRef.current.forEach((recording) => {
        if (recording.releaseTimeStamp !== undefined || recording.channel === undefined) return
        const updates = pendingUpdates.get(recording.channel)
        if (!updates) return
        updatesByNote.set(recording.noteId, updates)
      })

      if (updatesByNote.size === 0) return current

      const notesByTrack = Object.fromEntries(Object.entries(current.notesByTrack).map(([trackId, notes]) => {
        const nextNotes = notes.map((note) => {
          const updates = updatesByNote.get(note.id)
          if (!updates) return note
          changed = true
          return { ...note, ...updates }
        })
        return [trackId, nextNotes]
      }))

      return changed ? { ...current, notesByTrack } : current
    })
  }

  function updateMidiControlNotes(channel: number, updates: Partial<Note>) {
    const currentUpdates = pendingMidiControlUpdatesRef.current.get(channel) ?? {}
    pendingMidiControlUpdatesRef.current.set(channel, { ...currentUpdates, ...updates })
    if (midiControlUpdateFrameRef.current === null) {
      midiControlUpdateFrameRef.current = window.requestAnimationFrame(flushPendingMidiControlUpdates)
    }
  }

  function scheduleLiveMidiVoiceRestart(channel: number) {
    const hasActiveVoices = Array.from(keyboardRecordingRef.current.values()).some((recording) =>
      recording.channel === channel &&
      recording.releaseTimeStamp === undefined &&
      liveMidiVoicesRef.current.has(`midi:${channel}:${recording.pitch}`),
    )
    if (!hasActiveVoices) return

    const timeoutId = pendingMidiLiveRestartTimeoutsRef.current.get(channel)
    if (timeoutId !== undefined) return

    const now = performance.now()
    const lastRestartAt = lastMidiLiveRestartAtRef.current.get(channel) ?? 0
    const delay = Math.max(0, MIDI_LIVE_RESTART_INTERVAL_MS - (now - lastRestartAt))

    const restart = () => {
      pendingMidiLiveRestartTimeoutsRef.current.delete(channel)
      lastMidiLiveRestartAtRef.current.set(channel, performance.now())
      restartLiveMidiVoices(channel)
    }

    if (delay === 0) {
      restart()
    } else {
      pendingMidiLiveRestartTimeoutsRef.current.set(channel, window.setTimeout(restart, delay))
    }
  }

  function hasControlChanged(currentValue: number, nextValue: number, epsilon = MIDI_CONTROL_UPDATE_EPSILON) {
    return Math.abs(currentValue - nextValue) >= epsilon
  }

  function clearPendingMidiWork() {
    if (midiControlUpdateFrameRef.current !== null) {
      window.cancelAnimationFrame(midiControlUpdateFrameRef.current)
      midiControlUpdateFrameRef.current = null
    }
    pendingMidiControlUpdatesRef.current.clear()
    pendingMidiLiveRestartTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
    pendingMidiLiveRestartTimeoutsRef.current.clear()
  }

  function hasActiveMidiNotes(channel: number) {
    return Array.from(keyboardRecordingRef.current.values()).some((recording) =>
      recording.channel === channel && recording.releaseTimeStamp === undefined,
    )
  }

  function updateActiveMidiControl(channel: number, updates: Partial<Note>, restartLiveVoices: boolean) {
    if (!hasActiveMidiNotes(channel)) return
    updateMidiControlNotes(channel, updates)
    if (restartLiveVoices) scheduleLiveMidiVoiceRestart(channel)
  }

  function stopLiveMidiVoicesForChannelAndClear(channel: number, immediate = false) {
    const timeoutId = pendingMidiLiveRestartTimeoutsRef.current.get(channel)
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId)
      pendingMidiLiveRestartTimeoutsRef.current.delete(channel)
    }
    stopLiveMidiVoicesForChannel(channel, immediate)
  }

  function restartLiveMidiVoices(channel: number) {
    const controls = getMidiControls(channel)
    keyboardRecordingRef.current.forEach((recording, code) => {
      if (recording.channel !== channel || recording.releaseTimeStamp !== undefined) return
      if (!liveMidiVoicesRef.current.has(code)) return

      stopLiveMidiVoice(code, true)
      createLiveMidiVoice(code, recording.pitch, recording.velocity, controls, channel)
    })
  }

  function releaseSustainedNotes(channel: number, eventTimeStamp?: number) {
    const pendingCodes = [...keyboardRecordingRef.current.entries()]
      .filter(([, recording]) => recording.channel === channel && recording.releaseTimeStamp !== undefined)
      .map(([code]) => code)

    pendingCodes.forEach((code) => {
      const recording = keyboardRecordingRef.current.get(code)
      if (recording) recording.releaseTimeStamp = undefined
      finishKeyboardNote(code, eventTimeStamp)
    })
  }

  function handleMidiControlChange(channel: number, controller: number, value: number, eventTimeStamp?: number) {
    const controls = getMidiControls(channel)
    const normalizedValue = clamp01(value / 127)
    if (controller === 120 || controller === 123) {
      stopLiveMidiVoicesForChannelAndClear(channel, true)
      return
    }
    if (controller === 121) {
      midiControlsRef.current.set(channel, { ...DEFAULT_MIDI_CONTROLS })
      releaseSustainedNotes(channel, eventTimeStamp)
      updateActiveMidiControl(channel, {
        expression: DEFAULT_MIDI_CONTROLS.expression,
        modulation: DEFAULT_MIDI_CONTROLS.modulation,
        pan: DEFAULT_MIDI_CONTROLS.pan,
        pitchBend: DEFAULT_MIDI_CONTROLS.pitchBend,
        reverb: DEFAULT_MIDI_CONTROLS.reverb,
        volume: DEFAULT_MIDI_CONTROLS.volume,
      }, true)
      return
    }
    if (controller === 1) {
      const previousModulation = controls.modulation
      if (!hasControlChanged(previousModulation, normalizedValue)) return
      controls.modulation = normalizedValue
      updateActiveMidiControl(
        channel,
        { modulation: controls.modulation },
        (previousModulation <= MIDI_CONTROL_UPDATE_EPSILON) !== (controls.modulation <= MIDI_CONTROL_UPDATE_EPSILON),
      )
      return
    }
    if (controller === 7) {
      if (!hasControlChanged(controls.volume, normalizedValue)) return
      controls.volume = normalizedValue
      updateActiveMidiControl(channel, { volume: controls.volume }, false)
      return
    }
    if (controller === 10) {
      const pan = clampPan((value - 64) / 63)
      if (!hasControlChanged(controls.pan, pan)) return
      const previousPan = controls.pan
      controls.pan = pan
      updateActiveMidiControl(
        channel,
        { pan: controls.pan },
        (Math.abs(previousPan) <= MIDI_CONTROL_UPDATE_EPSILON) !==
          (Math.abs(controls.pan) <= MIDI_CONTROL_UPDATE_EPSILON),
      )
      return
    }
    if (controller === 11) {
      if (!hasControlChanged(controls.expression, normalizedValue)) return
      controls.expression = normalizedValue
      updateActiveMidiControl(channel, { expression: controls.expression }, false)
      return
    }
    if (controller === 64) {
      controls.sustain = value >= 64
      if (!controls.sustain) releaseSustainedNotes(channel, eventTimeStamp)
      return
    }
    if (controller === 91) {
      const previousReverb = controls.reverb
      if (!hasControlChanged(previousReverb, normalizedValue)) return
      controls.reverb = normalizedValue
      updateActiveMidiControl(
        channel,
        { reverb: controls.reverb },
        (previousReverb <= MIDI_CONTROL_UPDATE_EPSILON) !== (controls.reverb <= MIDI_CONTROL_UPDATE_EPSILON),
      )
    }
  }

  function handleMidiProgramChange(channel: number, program: number) {
    const currentTrack = getMidiTargetTrack(channel)
    if (!currentTrack) return

    const instrumentId = `gm-${Math.max(0, Math.min(127, program))}`
    stopLiveMidiVoicesForChannelAndClear(channel, true)
    disposeSharedLiveMidiInstrumentsForTrack(currentTrack.id)
    const nextTrack = {
      ...currentTrack,
      channel: channel + 1,
      instrumentId,
    }
    selectedTrackRef.current = nextTrack
    applyProgramChangeToPlaybackTrack(currentTrack.id, instrumentId)
    setProject((current) => ({
      ...current,
      tracks: current.tracks.map((track) =>
        track.id === currentTrack.id
          ? nextTrack
          : track,
      ),
    }))
  }

  function handleMidiPitchBend(channel: number, leastSignificant: number, mostSignificant: number) {
    const value = (mostSignificant << 7) | leastSignificant
    const pitchBend = Math.max(-2, Math.min(2, ((value - 8192) / 8192) * 2))
    const controls = getMidiControls(channel)
    if (!hasControlChanged(controls.pitchBend, pitchBend, MIDI_PITCH_BEND_EPSILON)) return
    controls.pitchBend = pitchBend
    updateActiveMidiControl(channel, { pitchBend }, true)
  }

  function handleMidiAftertouch(channel: number, value: number) {
    const controls = getMidiControls(channel)
    const modulation = clamp01(value / 127)
    if (!hasControlChanged(controls.modulation, modulation)) return
    const previousModulation = controls.modulation
    controls.modulation = modulation
    updateActiveMidiControl(
      channel,
      { modulation: controls.modulation },
      (previousModulation <= MIDI_CONTROL_UPDATE_EPSILON) !== (controls.modulation <= MIDI_CONTROL_UPDATE_EPSILON),
    )
  }

  useEffect(() => {
    if (!keyboardInputEnabled) return undefined

    const intervalId = window.setInterval(updateActiveDurations, 80)
    return () => window.clearInterval(intervalId)
  }, [keyboardInputEnabled, isPlaying])

  useEffect(() => {
    clearPendingMidiWork()
    liveMidiVoicesRef.current.forEach((_, code) => stopLiveMidiVoice(code, true))
    disposeAllSharedLiveMidiInstruments()
    keyboardRecordingRef.current.clear()
  }, [selectedTrack?.id])

  useMidiInput({
    finishMidiNote,
    handleMidiAftertouch,
    handleMidiControlChange,
    handleMidiPitchBend,
    handleMidiProgramChange,
    isPlaying,
    keyboardInputEnabled,
    startMidiNote,
  })

  return {
    finishKeyboardNote,
    getKeyboardInputPitch,
    getPlaybackBeatAtEventTime,
    playLiveKeyboardInput,
    startKeyboardNote,
  }
}
