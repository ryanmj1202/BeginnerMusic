import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from 'react'
import { useEffect, useRef } from 'react'
import * as Tone from 'tone'
import {
  createInstrument,
  isDrumInstrument,
  waitForInstrumentReady,
} from '../../../lib/audio/toneTransport'
import type {
  Note,
  Project,
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
  type TempoTimelineSegment,
} from '../helpers'
import type {
  ActivePlaybackTrack,
  KeyboardRecordingNote,
} from '../types'

type UseKeyboardRecordingOptions = {
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

type MidiNavigator = Navigator & {
  requestMIDIAccess?: () => Promise<MIDIAccess>
}

type MidiPerformanceControls = {
  expression: number
  modulation: number
  pan: number
  pitchBend: number
  reverb: number
  sustain: boolean
  volume: number
}

type LiveMidiVoice = {
  echo: Tone.FeedbackDelay | null
  instrument: ReturnType<typeof createInstrument>
  noteInput: number
  panner: Tone.Panner | null
  trackId: string
  vibrato: Tone.Vibrato | null
}

const DEFAULT_MIDI_CONTROLS: MidiPerformanceControls = {
  expression: 1,
  modulation: 0,
  pan: 0,
  pitchBend: 0,
  reverb: 0,
  sustain: false,
  volume: 1,
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function clampPan(value: number) {
  return Math.max(-1, Math.min(1, value))
}

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
  const liveMidiVoicesRef = useRef(new Map<string, LiveMidiVoice>())
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
    const playbackTotalBeats = totalBeatsRef.current || totalBeats
    const timeline = playbackTempoTimelineRef.current.length > 0
      ? playbackTempoTimelineRef.current
      : buildTempoTimeline(projectRef.current, playbackTotalBeats)
    return getBeatAtSecondsFromTimeline(
      timeline,
      playbackStartSecondsRef.current + elapsedMs / 1000,
      playbackTotalBeats,
    )
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

  function createLiveMidiVoice(code: string, pitch: number, velocity: number, controls: MidiPerformanceControls, channel?: number) {
    const currentTrack = getMidiTargetTrack(channel)
    if (!currentTrack) return null
    stopLiveMidiVoice(code, true)
    liveMidiVoicesRef.current.forEach((voice, voiceCode) => {
      if (voice.trackId !== currentTrack.id) stopLiveMidiVoice(voiceCode, true)
    })

    const instrument = createInstrument(currentTrack.instrumentId, 'preview', { isolatedSoundFont: !isDrumInstrument(currentTrack.instrumentId) })
    const bentPitch = pitch + controls.pitchBend
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

  function updateRecordingNote(recording: KeyboardRecordingNote, updates: Partial<Note>) {
    setProject((current) => {
      const notes = current.notesByTrack[recording.trackId] ?? []
      return {
        ...current,
        notesByTrack: {
          ...current.notesByTrack,
          [recording.trackId]: notes.map((note) =>
            note.id === recording.noteId
              ? { ...note, ...updates }
              : note,
          ),
        },
      }
    })
  }

  function updateActiveDurations() {
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
      ? playLiveKeyboardInput(currentTrack.id, pitch, velocity)
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
      eventStartMs: isPlaying ? undefined : performance.now(),
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

  function updateMidiControlNotes(channel: number, updates: Partial<Note>) {
    keyboardRecordingRef.current.forEach((recording) => {
      if (recording.channel === channel && recording.releaseTimeStamp === undefined) {
        updateRecordingNote(recording, updates)
      }
    })
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
      stopLiveMidiVoicesForChannel(channel, true)
      return
    }
    if (controller === 121) {
      midiControlsRef.current.set(channel, { ...DEFAULT_MIDI_CONTROLS })
      releaseSustainedNotes(channel, eventTimeStamp)
      restartLiveMidiVoices(channel)
      return
    }
    if (controller === 1) {
      controls.modulation = normalizedValue
      updateMidiControlNotes(channel, { modulation: controls.modulation })
      restartLiveMidiVoices(channel)
      return
    }
    if (controller === 7) {
      controls.volume = normalizedValue
      updateMidiControlNotes(channel, { volume: controls.volume })
      restartLiveMidiVoices(channel)
      return
    }
    if (controller === 10) {
      controls.pan = clampPan((value - 64) / 63)
      updateMidiControlNotes(channel, { pan: controls.pan })
      restartLiveMidiVoices(channel)
      return
    }
    if (controller === 11) {
      controls.expression = normalizedValue
      updateMidiControlNotes(channel, { expression: controls.expression })
      restartLiveMidiVoices(channel)
      return
    }
    if (controller === 64) {
      controls.sustain = value >= 64
      if (!controls.sustain) releaseSustainedNotes(channel, eventTimeStamp)
      return
    }
    if (controller === 91) {
      controls.reverb = normalizedValue
      updateMidiControlNotes(channel, { reverb: controls.reverb })
      restartLiveMidiVoices(channel)
    }
  }

  function handleMidiProgramChange(channel: number, program: number) {
    const currentTrack = getMidiTargetTrack(channel)
    if (!currentTrack) return

    const instrumentId = `gm-${Math.max(0, Math.min(127, program))}`
    stopLiveMidiVoicesForChannel(channel, true)
    const nextTrack = {
      ...currentTrack,
      channel: channel + 1,
      instrumentId,
    }
    selectedTrackRef.current = nextTrack
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
    controls.pitchBend = pitchBend
    updateMidiControlNotes(channel, { pitchBend })
    restartLiveMidiVoices(channel)
  }

  function handleMidiAftertouch(channel: number, value: number) {
    const controls = getMidiControls(channel)
    controls.modulation = clamp01(value / 127)
    updateMidiControlNotes(channel, { modulation: controls.modulation })
    restartLiveMidiVoices(channel)
  }

  useEffect(() => {
    if (!keyboardInputEnabled) return undefined

    const intervalId = window.setInterval(updateActiveDurations, 80)
    return () => window.clearInterval(intervalId)
  }, [keyboardInputEnabled, isPlaying])

  useEffect(() => {
    liveMidiVoicesRef.current.forEach((_, code) => stopLiveMidiVoice(code, true))
    keyboardRecordingRef.current.clear()
  }, [selectedTrack?.id])

  useEffect(() => {
    const midiNavigator = navigator as MidiNavigator
    if (!keyboardInputEnabled || !midiNavigator.requestMIDIAccess) return undefined

    let cancelled = false
    let midiAccess: MIDIAccess | null = null
    const connectedInputs: MIDIInput[] = []

    function handleMidiMessage(event: MIDIMessageEvent) {
      if (!event.data) return
      const [status = 0, first = 0, second = 0] = event.data
      const command = status & 0xf0
      const channel = status & 0x0f
      if (command === 0x90 && second > 0) {
        startMidiNote(channel, first, Math.max(0.01, Math.min(1, second / 127)), event.timeStamp)
        return
      }
      if (command === 0x80 || command === 0x90) {
        finishMidiNote(channel, first, event.timeStamp)
        return
      }
      if (command === 0xb0) {
        handleMidiControlChange(channel, first, second, event.timeStamp)
        return
      }
      if (command === 0xc0) {
        handleMidiProgramChange(channel, first)
        return
      }
      if (command === 0xe0) {
        handleMidiPitchBend(channel, first, second)
        return
      }
      if (command === 0xa0 || command === 0xd0) {
        handleMidiAftertouch(channel, command === 0xd0 ? first : second)
      }
    }

    function connectInputs(access: MIDIAccess) {
      connectedInputs.forEach((input) => {
        input.onmidimessage = null
      })
      connectedInputs.length = 0
      access.inputs.forEach((input) => {
        input.onmidimessage = handleMidiMessage
        connectedInputs.push(input)
      })
    }

    void midiNavigator.requestMIDIAccess().then((access) => {
      if (cancelled) return
      midiAccess = access
      connectInputs(access)
      access.onstatechange = () => connectInputs(access)
    }).catch(() => undefined)

    return () => {
      cancelled = true
      connectedInputs.forEach((input) => {
        input.onmidimessage = null
      })
      if (midiAccess) midiAccess.onstatechange = null
    }
  }, [keyboardInputEnabled, isPlaying])

  return {
    finishKeyboardNote,
    getKeyboardInputPitch,
    getPlaybackBeatAtEventTime,
    playLiveKeyboardInput,
    startKeyboardNote,
  }
}
