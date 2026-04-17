import * as Tone from 'tone'
import { getProgramFromInstrumentId } from '../midi/generalMidi'
import type { InstrumentId, Note } from '../../types/music'

type BeginnerInstrument = {
  triggerAttackRelease: (
    note: number,
    duration: number,
    time?: number,
    velocity?: number,
  ) => unknown
  triggerAttack: (note: number, time?: number, velocity?: number) => unknown
  triggerRelease: (note?: number, time?: number) => unknown
  dispose: () => unknown
}

export type HeldPreview = {
  instrument: BeginnerInstrument
  pitch: number
  startedAtMs: number
}

const RELEASE_BUFFER_SECONDS = 2
const MIN_PREVIEW_MS = 250

type InstrumentMode = 'playback' | 'preview'

export async function ensureAudioReady(): Promise<void> {
  if (Tone.getContext().state !== 'running') {
    await Tone.start()
  }
}

export function createInstrument(
  instrumentId: InstrumentId,
  mode: InstrumentMode = 'playback',
): BeginnerInstrument {
  const program = getProgramFromInstrumentId(instrumentId)
  const isPreview = mode === 'preview'

  if (instrumentId === 'drums' || (program !== null && program >= 112 && program <= 119)) {
    return new Tone.PolySynth({
      voice: Tone.MembraneSynth,
      maxPolyphony: isPreview ? 2 : 24,
      options: {
        pitchDecay: 0.025,
        octaves: 5,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay: 0.14, sustain: 0.01, release: isPreview ? 0.02 : 0.12 },
      },
    }).toDestination() as BeginnerInstrument
  }

  if (instrumentId === 'bass' || (program !== null && program >= 32 && program <= 39)) {
    return new Tone.PolySynth({
      voice: Tone.Synth,
      maxPolyphony: isPreview ? 2 : 18,
      options: {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.006, decay: 0.08, sustain: 0.62, release: isPreview ? 0.04 : 0.32 },
      },
    }).toDestination() as BeginnerInstrument
  }

  if (
    instrumentId === 'synth' ||
    (program !== null && ((program >= 80 && program <= 103) || program >= 120))
  ) {
    return new Tone.PolySynth({
      voice: Tone.Synth,
      maxPolyphony: isPreview ? 2 : 24,
      options: {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.01, decay: 0.12, sustain: 0.48, release: isPreview ? 0.05 : 0.55 },
      },
    }).toDestination() as BeginnerInstrument
  }

  if (instrumentId === 'brass' || (program !== null && program >= 56 && program <= 63)) {
    return new Tone.PolySynth({
      voice: Tone.Synth,
      maxPolyphony: isPreview ? 2 : 24,
      options: {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.02, decay: 0.12, sustain: 0.58, release: isPreview ? 0.05 : 0.42 },
      },
    }).toDestination() as BeginnerInstrument
  }

  return new Tone.PolySynth({
    voice: Tone.Synth,
    maxPolyphony: isPreview ? 2 : 24,
    options: {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.004, decay: 0.14, sustain: 0.24, release: isPreview ? 0.05 : 0.85 },
    },
  }).toDestination() as BeginnerInstrument
}

export function getPlaybackDurationMs(notes: Note[], tempo: number): number {
  const beatSeconds = 60 / tempo
  const endBeat = notes.reduce(
    (latestEnd, note) => Math.max(latestEnd, note.startBeat + note.durationBeats),
    0,
  )

  return Math.ceil((endBeat * beatSeconds + RELEASE_BUFFER_SECONDS) * 1000)
}

export function scheduleNotes(
  instrument: BeginnerInstrument,
  notes: Note[],
  tempo: number,
  startBeat = 0,
): number {
  const beatSeconds = 60 / tempo
  const startTime = Tone.now() + 0.08
  const playableNotes = notes.filter((note) => note.startBeat + note.durationBeats > startBeat)

  playableNotes.forEach((note) => {
    const offsetBeat = Math.max(0, startBeat - note.startBeat)
    const remainingDuration = note.durationBeats - offsetBeat
    const relativeStartBeat = Math.max(0, note.startBeat - startBeat)

    instrument.triggerAttackRelease(
      Tone.Frequency(note.pitch, 'midi').toFrequency(),
      Math.max(0.04, remainingDuration * beatSeconds),
      startTime + relativeStartBeat * beatSeconds,
      note.velocity,
    )
  })

  return getPlaybackDurationMs(playableNotes.map((note) => ({ ...note, startBeat: Math.max(0, note.startBeat - startBeat) })), tempo)
}

export function scheduleNotesInWindow(
  instrument: BeginnerInstrument,
  notes: Note[],
  tempo: number,
  currentBeat: number,
  windowEndBeat: number,
): number {
  const beatSeconds = 60 / tempo
  const startTime = Tone.now() + 0.05
  let latestEndBeat = currentBeat

  notes
    .filter((note) => note.startBeat < windowEndBeat && note.startBeat + note.durationBeats > currentBeat)
    .forEach((note) => {
      const offsetBeat = Math.max(0, currentBeat - note.startBeat)
      const remainingDuration = note.durationBeats - offsetBeat
      const relativeStartBeat = Math.max(0, note.startBeat - currentBeat)

      instrument.triggerAttackRelease(
        Tone.Frequency(note.pitch, 'midi').toFrequency(),
        Math.max(0.04, remainingDuration * beatSeconds),
        startTime + relativeStartBeat * beatSeconds,
        note.velocity,
      )
      latestEndBeat = Math.max(latestEndBeat, note.startBeat + note.durationBeats)
    })

  return Math.ceil(Math.max(0, latestEndBeat - currentBeat) * beatSeconds * 1000)
}

export async function startPreviewNote(
  instrumentId: InstrumentId,
  pitch: number,
  velocity = 0.75,
): Promise<HeldPreview> {
  await ensureAudioReady()
  const instrument = createInstrument(instrumentId, 'preview')
  const frequency = Tone.Frequency(pitch, 'midi').toFrequency()
  instrument.triggerAttack(frequency, Tone.now(), velocity)
  return { instrument, pitch, startedAtMs: performance.now() }
}

export function stopPreviewNote(preview: HeldPreview | null) {
  if (!preview) return
  const remainingMs = Math.max(0, MIN_PREVIEW_MS - (performance.now() - preview.startedAtMs))

  window.setTimeout(() => {
    preview.instrument.triggerRelease(Tone.Frequency(preview.pitch, 'midi').toFrequency(), Tone.now())
    window.setTimeout(() => preview.instrument.dispose(), 120)
  }, remainingMs)
}

export function disposePreviewNote(preview: HeldPreview | null) {
  if (!preview) return
  const remainingMs = Math.max(0, MIN_PREVIEW_MS - (performance.now() - preview.startedAtMs))
  window.setTimeout(() => preview.instrument.dispose(), remainingMs)
}

export function changePreviewNote(
  preview: HeldPreview | null,
  pitch: number,
  velocity = 0.75,
) {
  if (!preview || preview.pitch === pitch) return

  const now = Tone.now()
  preview.instrument.triggerRelease(undefined, now)
  preview.pitch = pitch
  preview.startedAtMs = performance.now()
  preview.instrument.triggerAttack(Tone.Frequency(pitch, 'midi').toFrequency(), now + 0.015, velocity)
}

export async function previewNote(
  instrumentId: InstrumentId,
  pitch: number,
  velocity = 0.75,
  durationSeconds = 0.28,
) {
  await ensureAudioReady()
  const instrument = createInstrument(instrumentId)
  instrument.triggerAttackRelease(
    Tone.Frequency(pitch, 'midi').toFrequency(),
    durationSeconds,
    Tone.now(),
    velocity,
  )
  window.setTimeout(() => instrument.dispose(), 900)
}
