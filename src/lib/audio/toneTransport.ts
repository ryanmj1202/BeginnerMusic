import * as Tone from 'tone'
import { getProgramFromInstrumentId, getSoundFontInstrumentName } from '../midi/generalMidi'
import type { InstrumentId, Note } from '../../types/music'

type BeginnerInstrument = {
  ready?: Promise<void>
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
const SOUNDFONT_BASE_URL = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/'
const SOUNDFONT_SAMPLE_URLS = {
  C2: 'C2.mp3',
  C3: 'C3.mp3',
  C4: 'C4.mp3',
  C5: 'C5.mp3',
  C6: 'C6.mp3',
}
const SOUNDFONT_LOAD_TIMEOUT_MS = 1500
const MAX_CACHED_SOUNDFONTS = 8
const SOUNDFONT_IDLE_CACHE_MS = 180_000

type InstrumentMode = 'playback' | 'preview'
type BasicOscillatorType = 'sine' | 'triangle' | 'sawtooth' | 'square'
type SoundFontCacheEntry = {
  activeUsers: number
  failed: boolean
  isReady: boolean
  lastUsed: number
  ready: Promise<void>
  sampler: Tone.Sampler
}

const OSCILLATORS: BasicOscillatorType[] = ['triangle', 'sine', 'square', 'sawtooth']
const failedSoundFonts = new Set<string>()
const soundFontCache = new Map<string, SoundFontCacheEntry>()
let activeOneShotPreview: { instrument: BeginnerInstrument; timeoutId: number } | null = null
let oneShotPreviewToken = 0

export async function ensureAudioReady(): Promise<void> {
  if (Tone.getContext().state !== 'running') {
    await Tone.start()
  }
}

function getVariant(program: number) {
  return program % 8
}

function pickOscillator(program: number, offset = 0) {
  return OSCILLATORS[(program + offset) % OSCILLATORS.length]
}

function getPreviewPitchForProgram(program: number) {
  if (program >= 32 && program < 40) return 40
  if (program >= 40 && program < 56) return 67
  if (program >= 56 && program < 64) return 62
  if (program >= 64 && program < 72) return 62
  if (program >= 72 && program < 80) return 76
  if (program === 112) return 84
  if (program === 113) return 76
  if (program === 114) return 67
  if (program === 115) return 72
  if (program >= 116 && program < 119) return 48
  if (program === 119) return 60
  return 60
}

export function getInstrumentPreviewPitch(instrumentId: InstrumentId) {
  if (instrumentId === 'drums') return 36

  const program = getProgramFromInstrumentId(instrumentId)
  return program === null ? 60 : getPreviewPitchForProgram(program)
}

export function waitForInstrumentReady(
  instrument: BeginnerInstrument,
  timeoutMs = SOUNDFONT_LOAD_TIMEOUT_MS,
) {
  const ready = instrument.ready
  if (!ready) return Promise.resolve()

  return new Promise<void>((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      window.clearTimeout(timeoutId)
      resolve()
    }
    const timeoutId = window.setTimeout(finish, timeoutMs)
    ready.then(finish, finish)
  })
}

function disposeSoundFontCacheEntry(name: string, entry: SoundFontCacheEntry) {
  entry.sampler.dispose()
  soundFontCache.delete(name)
}

function trimSoundFontCache() {
  const now = performance.now()
  Array.from(soundFontCache.entries()).forEach(([name, entry]) => {
    if (entry.activeUsers > 0) return
    if (now - entry.lastUsed < SOUNDFONT_IDLE_CACHE_MS) return
    disposeSoundFontCacheEntry(name, entry)
  })

  if (soundFontCache.size <= MAX_CACHED_SOUNDFONTS) return

  const disposableEntries = Array.from(soundFontCache.entries())
    .filter(([, entry]) => entry.activeUsers === 0)
    .sort(([, left], [, right]) => left.lastUsed - right.lastUsed)

  for (const [name, entry] of disposableEntries) {
    if (soundFontCache.size <= MAX_CACHED_SOUNDFONTS) return
    disposeSoundFontCacheEntry(name, entry)
  }
}

function getSoundFontCacheEntry(soundFontName: string) {
  const cached = soundFontCache.get(soundFontName)
  if (cached) {
    cached.lastUsed = performance.now()
    return cached
  }

  if (failedSoundFonts.has(soundFontName)) return null

  let resolveReady = () => {}
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve
  })
  const entry: SoundFontCacheEntry = {
    activeUsers: 0,
    failed: false,
    isReady: false,
    lastUsed: performance.now(),
    ready,
    sampler: null as unknown as Tone.Sampler,
  }
  const sampler = new Tone.Sampler({
    urls: SOUNDFONT_SAMPLE_URLS,
    baseUrl: `${SOUNDFONT_BASE_URL}${soundFontName}-mp3/`,
    onload: () => {
      entry.isReady = true
      resolveReady()
    },
    onerror: () => {
      failedSoundFonts.add(soundFontName)
      entry.failed = true
      resolveReady()
    },
  }).toDestination()
  entry.sampler = sampler
  soundFontCache.set(soundFontName, entry)
  trimSoundFontCache()
  return entry
}

function createSoundFontInstrument(
  instrumentId: InstrumentId,
  fallback: BeginnerInstrument,
): BeginnerInstrument {
  const soundFontName = getSoundFontInstrumentName(instrumentId)
  if (!soundFontName) return fallback

  const cacheEntry = getSoundFontCacheEntry(soundFontName)
  if (!cacheEntry || cacheEntry.failed) return fallback
  const entry = cacheEntry

  let disposed = false
  const activeNotes = new Set<number>()
  const releaseTimeouts = new Set<number>()
  entry.activeUsers += 1

  function releaseTrackedNote(note: number, time?: number) {
    activeNotes.delete(note)
    if (!entry.isReady || entry.failed) return
    entry.sampler.triggerRelease(note, time)
  }

  function scheduleTrackedRelease(note: number, duration: number, time?: number) {
    activeNotes.add(note)
    const waitMs = Math.max(0, ((time ?? Tone.now()) - Tone.now() + duration + 0.08) * 1000)
    const timeoutId = window.setTimeout(() => {
      activeNotes.delete(note)
      releaseTimeouts.delete(timeoutId)
    }, waitMs)
    releaseTimeouts.add(timeoutId)
  }

  return {
    ready: entry.ready,
    triggerAttackRelease(note, duration, time, velocity) {
      if (!entry.isReady || entry.failed) {
        return fallback.triggerAttackRelease(note, duration, time, velocity)
      }

      scheduleTrackedRelease(note, duration, time)
      entry.lastUsed = performance.now()
      return entry.sampler.triggerAttackRelease(note, duration, time, velocity)
    },
    triggerAttack(note, time, velocity) {
      if (!entry.isReady || entry.failed) {
        return fallback.triggerAttack(note, time, velocity)
      }

      activeNotes.add(note)
      entry.lastUsed = performance.now()
      return entry.sampler.triggerAttack(note, time, velocity)
    },
    triggerRelease(note, time) {
      fallback.triggerRelease(note, time)
      if (note === undefined) {
        activeNotes.forEach((activeNote) => releaseTrackedNote(activeNote, time))
        activeNotes.clear()
        return
      }
      return releaseTrackedNote(note, time)
    },
    dispose() {
      if (disposed) return
      disposed = true
      releaseTimeouts.forEach((timeoutId) => window.clearTimeout(timeoutId))
      releaseTimeouts.clear()
      activeNotes.forEach((activeNote) => releaseTrackedNote(activeNote, Tone.now()))
      activeNotes.clear()
      fallback.dispose()
      entry.activeUsers = Math.max(0, entry.activeUsers - 1)
      entry.lastUsed = performance.now()
      trimSoundFontCache()
    },
  }
}

export function createInstrument(
  instrumentId: InstrumentId,
  mode: InstrumentMode = 'playback',
): BeginnerInstrument {
  const fallback = createSynthInstrument(instrumentId, mode)
  return createSoundFontInstrument(instrumentId, fallback)
}

function createSynthInstrument(
  instrumentId: InstrumentId,
  mode: InstrumentMode = 'playback',
): BeginnerInstrument {
  const program = getProgramFromInstrumentId(instrumentId)
  const isPreview = mode === 'preview'
  const release = (playbackRelease: number, previewRelease = 0.05) =>
    isPreview ? previewRelease : playbackRelease
  const variant = program === null ? 0 : getVariant(program)

  if (instrumentId === 'drums') {
    return new Tone.PolySynth({
      voice: Tone.MembraneSynth,
      maxPolyphony: isPreview ? 2 : 24,
      options: {
        pitchDecay: 0.018 + variant * 0.004,
        octaves: 3 + variant,
        oscillator: { type: pickOscillator(variant, 1) },
        envelope: {
          attack: 0.001,
          decay: 0.09 + variant * 0.025,
          sustain: variant % 3 === 0 ? 0.01 : 0.04,
          release: release(0.08 + variant * 0.025, 0.025),
        },
      },
    }).toDestination() as BeginnerInstrument
  }

  if (program !== null && program < 8) {
    return new Tone.PolySynth({
      voice: Tone.FMSynth,
      maxPolyphony: isPreview ? 2 : 24,
      options: {
        harmonicity: 2.2 + variant * 0.27,
        modulationIndex: 6 + variant * 2.4,
        envelope: {
          attack: 0.001 + variant * 0.001,
          decay: 0.16 + variant * 0.055,
          sustain: 0.1 + (variant % 4) * 0.08,
          release: release(0.35 + variant * 0.08),
        },
        modulationEnvelope: {
          attack: 0.001,
          decay: 0.1 + variant * 0.04,
          sustain: 0.03 + (variant % 3) * 0.04,
          release: release(0.18 + variant * 0.035),
        },
      },
    }).toDestination() as BeginnerInstrument
  }

  if (program !== null && program >= 8 && program < 16) {
    return new Tone.PolySynth({
      voice: Tone.FMSynth,
      maxPolyphony: isPreview ? 2 : 20,
      options: {
        harmonicity: 3 + variant * 0.6,
        modulationIndex: 10 + variant * 3,
        envelope: {
          attack: 0.001,
          decay: 0.18 + variant * 0.075,
          sustain: 0.03 + (variant % 4) * 0.04,
          release: release(0.22 + variant * 0.04),
        },
        modulationEnvelope: {
          attack: 0.001,
          decay: 0.12 + variant * 0.035,
          sustain: 0.02 + (variant % 2) * 0.06,
          release: release(0.12 + variant * 0.03),
        },
      },
    }).toDestination() as BeginnerInstrument
  }

  if (program !== null && program >= 16 && program < 24) {
    return new Tone.PolySynth({
      voice: Tone.AMSynth,
      maxPolyphony: isPreview ? 2 : 24,
      options: {
        harmonicity: 0.75 + variant * 0.2,
        oscillator: { type: pickOscillator(variant, 2) },
        envelope: {
          attack: 0.004 + variant * 0.003,
          decay: 0.03 + variant * 0.02,
          sustain: 0.58 + (variant % 4) * 0.1,
          release: release(0.12 + variant * 0.05),
        },
        modulation: { type: pickOscillator(variant, 1) },
        modulationEnvelope: {
          attack: 0.006,
          decay: 0.04 + variant * 0.025,
          sustain: 0.45 + (variant % 3) * 0.14,
          release: release(0.1 + variant * 0.03),
        },
      },
    }).toDestination() as BeginnerInstrument
  }

  if (program !== null && program >= 24 && program < 32) {
    return new Tone.PolySynth({
      voice: Tone.Synth,
      maxPolyphony: isPreview ? 2 : 18,
      options: {
        oscillator: { type: pickOscillator(variant, program >= 29 ? 3 : 0) },
        envelope: {
          attack: 0.002 + variant * 0.001,
          decay: 0.08 + variant * 0.035,
          sustain: 0.08 + (variant % 5) * 0.07,
          release: release(0.12 + variant * 0.05),
        },
      },
    }).toDestination() as BeginnerInstrument
  }

  if (instrumentId === 'bass' || (program !== null && program >= 32 && program <= 39)) {
    return new Tone.PolySynth({
      voice: Tone.Synth,
      maxPolyphony: isPreview ? 2 : 18,
      options: {
        oscillator: { type: pickOscillator(variant, program !== null && program >= 38 ? 2 : 0) },
        envelope: {
          attack: 0.004 + variant * 0.002,
          decay: 0.05 + variant * 0.025,
          sustain: 0.35 + (variant % 5) * 0.11,
          release: release(0.18 + variant * 0.06, 0.04),
        },
      },
    }).toDestination() as BeginnerInstrument
  }

  if (program !== null && program >= 40 && program < 56) {
    return new Tone.PolySynth({
      voice: Tone.Synth,
      maxPolyphony: isPreview ? 2 : 24,
      options: {
        oscillator: { type: pickOscillator(variant, 3) },
        envelope: {
          attack: 0.025 + variant * 0.018,
          decay: 0.08 + variant * 0.03,
          sustain: 0.42 + (variant % 4) * 0.12,
          release: release(0.45 + variant * 0.12),
        },
      },
    }).toDestination() as BeginnerInstrument
  }

  if (instrumentId === 'brass' || (program !== null && program >= 56 && program <= 63)) {
    return new Tone.PolySynth({
      voice: Tone.Synth,
      maxPolyphony: isPreview ? 2 : 24,
      options: {
        oscillator: { type: pickOscillator(variant, 3) },
        envelope: {
          attack: 0.012 + variant * 0.009,
          decay: 0.08 + variant * 0.035,
          sustain: 0.45 + (variant % 4) * 0.12,
          release: release(0.22 + variant * 0.07),
        },
      },
    }).toDestination() as BeginnerInstrument
  }

  if (program !== null && program >= 64 && program < 80) {
    return new Tone.PolySynth({
      voice: Tone.Synth,
      maxPolyphony: isPreview ? 2 : 20,
      options: {
        oscillator: { type: pickOscillator(variant, 1) },
        envelope: {
          attack: 0.01 + variant * 0.008,
          decay: 0.09 + variant * 0.04,
          sustain: 0.28 + (variant % 5) * 0.11,
          release: release(0.25 + variant * 0.08),
        },
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
        oscillator: { type: pickOscillator(variant, program !== null && program >= 96 ? 1 : 2) },
        envelope: {
          attack: 0.002 + variant * 0.01,
          decay: 0.08 + variant * 0.04,
          sustain: 0.22 + (variant % 6) * 0.1,
          release: release(0.22 + variant * 0.1),
        },
      },
    }).toDestination() as BeginnerInstrument
  }

  if (program !== null && program >= 104 && program < 112) {
    return new Tone.PolySynth({
      voice: Tone.Synth,
      maxPolyphony: isPreview ? 2 : 16,
      options: {
        oscillator: { type: pickOscillator(variant) },
        envelope: {
          attack: 0.004 + variant * 0.003,
          decay: 0.12 + variant * 0.05,
          sustain: 0.16 + (variant % 5) * 0.08,
          release: release(0.32 + variant * 0.09),
        },
      },
    }).toDestination() as BeginnerInstrument
  }

  if (program !== null && program >= 112 && program < 120) {
    return new Tone.PolySynth({
      voice: Tone.FMSynth,
      maxPolyphony: isPreview ? 2 : 18,
      options: {
        harmonicity: 4 + variant * 0.35,
        modulationIndex: 10 + variant * 2,
        envelope: {
          attack: 0.001,
          decay: 0.12 + variant * 0.04,
          sustain: 0.02 + (variant % 3) * 0.06,
          release: release(0.18 + variant * 0.05),
        },
        modulationEnvelope: {
          attack: 0.001,
          decay: 0.1 + variant * 0.03,
          sustain: 0.01 + (variant % 2) * 0.04,
          release: release(0.12 + variant * 0.03),
        },
      },
    }).toDestination() as BeginnerInstrument
  }

  return new Tone.PolySynth({
    voice: Tone.Synth,
    maxPolyphony: isPreview ? 2 : 24,
    options: {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.004, decay: 0.14, sustain: 0.24, release: release(0.85) },
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
  await waitForInstrumentReady(instrument)
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
  const previewToken = ++oneShotPreviewToken
  await ensureAudioReady()
  if (previewToken !== oneShotPreviewToken) return

  if (activeOneShotPreview) {
    window.clearTimeout(activeOneShotPreview.timeoutId)
    activeOneShotPreview.instrument.triggerRelease(undefined, Tone.now())
    activeOneShotPreview.instrument.dispose()
    activeOneShotPreview = null
  }

  const instrument = createInstrument(instrumentId, 'preview')
  await waitForInstrumentReady(instrument)
  if (previewToken !== oneShotPreviewToken) {
    instrument.dispose()
    return
  }

  instrument.triggerAttackRelease(
    Tone.Frequency(pitch, 'midi').toFrequency(),
    durationSeconds,
    Tone.now(),
    velocity,
  )
  const timeoutId = window.setTimeout(() => {
    instrument.dispose()
    if (activeOneShotPreview?.instrument === instrument) {
      activeOneShotPreview = null
    }
  }, Math.max(900, durationSeconds * 1000 + 650))
  activeOneShotPreview = { instrument, timeoutId }
}
