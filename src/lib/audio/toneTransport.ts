import * as Tone from 'tone'
import { getProgramFromInstrumentId, getSoundFontInstrumentName } from '../midi/generalMidi'
import type { InstrumentId, Note } from '../../types/music'
import { createSf2DrumKitInstrument } from './sf2DrumKit'

export type BeginnerInstrument = {
  expectsMidi?: boolean
  readyTimeoutMs?: number
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
const FLUID_SOUNDFONT_BASE_URL = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/'
const ORCHESTRAL_SOUNDFONT_BASE_URL = 'https://gleitz.github.io/midi-js-soundfonts/MusyngKite/'
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
const DRUM_INSTRUMENT_IDS = new Set<InstrumentId>(['drums', 'standard-drums'])

export type InstrumentMode = 'playback' | 'preview'
type BasicOscillatorType = 'sine' | 'triangle' | 'sawtooth' | 'square'
type BasicNoiseType = 'white' | 'pink' | 'brown'
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
  Tone.getDestination().mute = false
}

export function silenceAllAudioOutput() {
  Tone.getDestination().mute = true
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
  if (isDrumInstrument(instrumentId)) return 36

  const program = getProgramFromInstrumentId(instrumentId)
  return program === null ? 60 : getPreviewPitchForProgram(program)
}

export function waitForInstrumentReady(
  instrument: BeginnerInstrument,
  timeoutMs = SOUNDFONT_LOAD_TIMEOUT_MS,
) {
  const ready = instrument.ready
  if (!ready) return Promise.resolve()
  const effectiveTimeoutMs = instrument.readyTimeoutMs ?? timeoutMs

  return new Promise<void>((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      window.clearTimeout(timeoutId)
      resolve()
    }
    const timeoutId = window.setTimeout(finish, effectiveTimeoutMs)
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

function getSoundFontBaseUrl(instrumentId: InstrumentId) {
  const program = getProgramFromInstrumentId(instrumentId)
  if (program === null) return FLUID_SOUNDFONT_BASE_URL
  if (program >= 40 && program < 80) return ORCHESTRAL_SOUNDFONT_BASE_URL
  return FLUID_SOUNDFONT_BASE_URL
}

export function isDrumInstrument(instrumentId: InstrumentId) {
  return DRUM_INSTRUMENT_IDS.has(instrumentId)
}

function getSoundFontCacheEntry(soundFontName: string, baseUrl: string) {
  const cacheKey = `${baseUrl}${soundFontName}`
  const cached = soundFontCache.get(cacheKey)
  if (cached) {
    cached.lastUsed = performance.now()
    return cached
  }

  if (failedSoundFonts.has(cacheKey)) return null

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
    baseUrl: `${baseUrl}${soundFontName}-mp3/`,
    onload: () => {
      entry.isReady = true
      resolveReady()
    },
    onerror: () => {
      failedSoundFonts.add(cacheKey)
      entry.failed = true
      resolveReady()
    },
  }).toDestination()
  entry.sampler = sampler
  soundFontCache.set(cacheKey, entry)
  trimSoundFontCache()
  return entry
}

function createSoundFontInstrument(
  instrumentId: InstrumentId,
  fallback: BeginnerInstrument,
): BeginnerInstrument {
  const soundFontName = getSoundFontInstrumentName(instrumentId)
  if (!soundFontName) return fallback

  const cacheEntry = getSoundFontCacheEntry(soundFontName, getSoundFontBaseUrl(instrumentId))
  if (!cacheEntry || cacheEntry.failed) return fallback
  const entry = cacheEntry

  let disposed = false
  const activeNotes = new Map<number, number>()
  const releaseTimeouts = new Set<number>()
  entry.activeUsers += 1

  function addTrackedNote(note: number) {
    activeNotes.set(note, (activeNotes.get(note) ?? 0) + 1)
  }

  function releaseTrackedNote(note: number, time?: number) {
    const nextCount = (activeNotes.get(note) ?? 1) - 1
    if (nextCount > 0) {
      activeNotes.set(note, nextCount)
      return
    }

    activeNotes.delete(note)
    if (!entry.isReady || entry.failed) return
    entry.sampler.triggerRelease(note, time)
  }

  function scheduleTrackedRelease(note: number, duration: number, time?: number) {
    addTrackedNote(note)
    const waitMs = Math.max(0, ((time ?? Tone.now()) - Tone.now() + duration + 0.08) * 1000)
    const timeoutId = window.setTimeout(() => {
      releaseTrackedNote(note, Tone.now())
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

      addTrackedNote(note)
      entry.lastUsed = performance.now()
      return entry.sampler.triggerAttack(note, time, velocity)
    },
    triggerRelease(note, time) {
      fallback.triggerRelease(note, time)
      if (note === undefined) {
        Array.from(activeNotes.keys()).forEach((activeNote) => {
          activeNotes.set(activeNote, 1)
          releaseTrackedNote(activeNote, time)
        })
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
      Array.from(activeNotes.keys()).forEach((activeNote) => {
        activeNotes.set(activeNote, 1)
        releaseTrackedNote(activeNote, Tone.now())
      })
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
  if (isDrumInstrument(instrumentId)) {
    return createSf2DrumKitInstrument(
      mode,
      createDrumKitInstrument(mode),
      instrumentId === 'standard-drums' ? 'standard' : 'power',
    )
  }

  const fallback = createSynthInstrument(instrumentId, mode)
  return createSoundFontInstrument(instrumentId, fallback)
}

function getMidiFromNoteInput(note: number) {
  if (note >= 0 && note <= 127 && Number.isInteger(note)) return note
  return Math.round(Tone.Frequency(note).toMidi())
}

function createDrumKitInstrument(mode: InstrumentMode): BeginnerInstrument {
  const activeVoices = new Set<{ dispose: () => unknown }>()
  const activeTimeouts = new Set<number>()
  const isPreview = mode === 'preview'
  let disposed = false

  function clearManagedTimeout(timeoutId: number) {
    window.clearTimeout(timeoutId)
    activeTimeouts.delete(timeoutId)
  }

  function disposeLater(voice: { dispose: () => unknown }, waitMs: number) {
    if (disposed) {
      voice.dispose()
      return
    }
    activeVoices.add(voice)
    const timeoutId = window.setTimeout(() => {
      activeTimeouts.delete(timeoutId)
      voice.dispose()
      activeVoices.delete(voice)
    }, waitMs)
    activeTimeouts.add(timeoutId)
  }

  function playNoise(
    duration: number,
    velocity: number,
    options: {
      attack: number
      decay: number
      release: number
      sustain: number
    },
    type: BasicNoiseType = 'white',
  ) {
    const voice = new Tone.NoiseSynth({
      noise: { type },
      envelope: options,
    }).toDestination()
    voice.triggerAttackRelease(duration, Tone.now(), velocity)
    disposeLater(voice, Math.max(120, duration * 1000 + 160))
  }

  function playMetal(
    duration: number,
    velocity: number,
    frequency: number,
    options: { harmonicity?: number; modulationIndex?: number; resonance?: number; octaves?: number } = {},
  ) {
    const voice = new Tone.MetalSynth({
      envelope: {
        attack: 0.001,
        decay: duration,
        release: 0.02,
      },
      harmonicity: options.harmonicity ?? 5.1,
      modulationIndex: options.modulationIndex ?? 18,
      resonance: options.resonance ?? 3600,
      octaves: options.octaves ?? 1.2,
    }).toDestination()
    voice.frequency.value = frequency
    voice.triggerAttackRelease(duration, Tone.now(), velocity)
    disposeLater(voice, Math.max(140, duration * 1000 + 180))
  }

  function playKick(midi: number, velocity: number) {
    const voice = new Tone.MembraneSynth({
      pitchDecay: midi === 35 ? 0.075 : 0.052,
      octaves: midi === 35 ? 10 : 8,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: midi === 35 ? 0.38 : 0.28, sustain: 0.002, release: 0.02 },
    }).toDestination()
    voice.triggerAttackRelease(midi === 35 ? 'G0' : 'B0', midi === 35 ? 0.25 : 0.19, Tone.now(), velocity)
    disposeLater(voice, 460)

    playNoise(0.028, velocity * 0.42, {
      attack: 0.001,
      decay: 0.025,
      sustain: 0,
      release: 0.006,
    }, 'brown')
    playToneClick(90, 0.018, velocity * 0.55, 'square')
  }

  function playSnare(midi: number, velocity: number) {
    if (midi === 37) {
      playToneClick(920, 0.045, velocity * 0.72, 'square')
      return
    }

    if (midi === 39) {
      playClap(velocity)
      return
    }

    playNoise(midi === 40 ? 0.2 : 0.15, velocity * 1.05, {
      attack: 0.001,
      decay: midi === 40 ? 0.18 : 0.14,
      sustain: 0.012,
      release: 0.025,
    }, midi === 40 ? 'pink' : 'white')

    const body = new Tone.MembraneSynth({
      pitchDecay: 0.014,
      octaves: 2,
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.001, decay: 0.08, sustain: 0.01, release: 0.02 },
    }).toDestination()
    body.triggerAttackRelease(midi === 40 ? 'D2' : 'C2', 0.075, Tone.now(), velocity * 0.42)
    disposeLater(body, 220)
    playToneClick(midi === 40 ? 2400 : 1800, 0.018, velocity * 0.38, 'square')
  }

  function playToneClick(
    frequency: number,
    duration: number,
    velocity: number,
    oscillator: BasicOscillatorType = 'triangle',
  ) {
    const voice = new Tone.Synth({
      oscillator: { type: oscillator },
      envelope: { attack: 0.001, decay: duration, sustain: 0, release: 0.01 },
    }).toDestination()
    voice.triggerAttackRelease(frequency, duration, Tone.now(), velocity)
    disposeLater(voice, Math.max(120, duration * 1000 + 120))
  }

  function playClap(velocity: number) {
    ;[0, 24, 48].forEach((delayMs) => {
      const timeoutId = window.setTimeout(() => {
        activeTimeouts.delete(timeoutId)
        activeVoices.delete(timeoutVoice)
        if (disposed) return
        playNoise(0.08, velocity * 0.42, {
          attack: 0.001,
          decay: 0.07,
          sustain: 0.02,
          release: 0.018,
        }, 'white')
      }, delayMs)
      activeTimeouts.add(timeoutId)
      const timeoutVoice = { dispose: () => clearManagedTimeout(timeoutId) }
      activeVoices.add(timeoutVoice)
    })
  }

  function playTom(midi: number, velocity: number) {
    const tomPitchByMidi: Record<number, string> = {
      41: 'F1',
      43: 'G1',
      45: 'A1',
      47: 'B1',
      48: 'C2',
      50: 'D2',
    }
    const voice = new Tone.MembraneSynth({
      pitchDecay: 0.03,
      octaves: 3.5,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.2, sustain: 0.035, release: 0.04 },
    }).toDestination()
    voice.triggerAttackRelease(tomPitchByMidi[midi] ?? 'A1', 0.18, Tone.now(), velocity * 0.9)
    disposeLater(voice, 360)
  }

  function playHat(midi: number, velocity: number) {
    const isOpen = midi === 46
    playNoise(isOpen ? 0.34 : 0.07, velocity * 0.7, {
      attack: 0.001,
      decay: isOpen ? 0.3 : 0.06,
      sustain: 0.006,
      release: isOpen ? 0.055 : 0.012,
    }, 'white')
    playMetal(isOpen ? 0.32 : 0.055, velocity * 0.52, isOpen ? 860 : 1280, {
      harmonicity: 9.2,
      modulationIndex: 30,
      resonance: isOpen ? 7200 : 8800,
      octaves: 0.42,
    })
  }

  function playCymbal(midi: number, velocity: number) {
    const ride = midi === 51 || midi === 53 || midi === 59
    playMetal(ride ? 0.72 : 0.64, velocity * 0.78, ride ? 520 : 370, {
      harmonicity: ride ? 5.4 : 7.2,
      modulationIndex: ride ? 18 : 34,
      resonance: ride ? 3800 : 6400,
      octaves: ride ? 1.3 : 0.85,
    })
    playNoise(ride ? 0.52 : 0.44, velocity * 0.38, {
      attack: 0.001,
      decay: ride ? 0.48 : 0.36,
      sustain: 0.015,
      release: 0.08,
    }, 'white')
  }

  function playTambourine(velocity: number) {
    playMetal(0.16, velocity * 0.45, 1180, {
      harmonicity: 8.5,
      modulationIndex: 34,
      resonance: 7200,
      octaves: 0.5,
    })
    playNoise(0.11, velocity * 0.35, { attack: 0.001, decay: 0.09, sustain: 0.01, release: 0.02 })
  }

  function playCowbell(velocity: number) {
    playToneClick(560, 0.12, velocity * 0.7, 'square')
    playToneClick(845, 0.09, velocity * 0.45, 'square')
  }

  function playVibraslap(velocity: number) {
    playToneClick(190, 0.04, velocity * 0.5, 'sawtooth')
    playNoise(0.32, velocity * 0.35, { attack: 0.002, decay: 0.28, sustain: 0.02, release: 0.06 }, 'brown')
  }

  function playHandDrum(midi: number, velocity: number) {
    const pitchByMidi: Record<number, string> = {
      60: 'G3',
      61: 'D3',
      62: 'A2',
      63: 'E2',
      64: 'C2',
      65: 'F3',
      66: 'C3',
    }
    const voice = new Tone.MembraneSynth({
      pitchDecay: 0.012,
      octaves: 1.8,
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.001, decay: midi >= 65 ? 0.16 : 0.22, sustain: 0.02, release: 0.025 },
    }).toDestination()
    voice.triggerAttackRelease(pitchByMidi[midi] ?? 'C3', 0.13, Tone.now(), velocity * 0.78)
    disposeLater(voice, 280)
  }

  function playAgogo(midi: number, velocity: number) {
    playToneClick(midi === 67 ? 880 : 620, 0.16, velocity * 0.72, 'square')
  }

  function playShaker(midi: number, velocity: number) {
    const duration = midi === 70 ? 0.08 : 0.12
    playNoise(duration, velocity * 0.42, {
      attack: 0.001,
      decay: duration,
      sustain: 0.01,
      release: 0.02,
    }, midi === 69 ? 'pink' : 'white')
  }

  function playWhistle(midi: number, velocity: number) {
    playToneClick(midi === 71 ? 1760 : 1320, midi === 71 ? 0.12 : 0.34, velocity * 0.55, 'sine')
  }

  function playScraper(midi: number, velocity: number) {
    const duration = midi === 73 ? 0.14 : 0.34
    playNoise(duration, velocity * 0.35, {
      attack: 0.002,
      decay: duration,
      sustain: 0.04,
      release: 0.04,
    }, 'brown')
    playToneClick(midi === 73 ? 520 : 410, 0.035, velocity * 0.28, 'square')
  }

  function playWood(midi: number, velocity: number) {
    const frequency = midi === 75 ? 1120 : midi === 76 ? 940 : 640
    playToneClick(frequency, 0.055, velocity * 0.72, 'triangle')
  }

  function playCuica(midi: number, velocity: number) {
    const voice = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: midi === 78 ? 0.08 : 0.18, sustain: 0, release: 0.025 },
    }).toDestination()
    const now = Tone.now()
    voice.frequency.setValueAtTime(midi === 78 ? 760 : 520, now)
    voice.frequency.exponentialRampToValueAtTime(midi === 78 ? 360 : 980, now + (midi === 78 ? 0.07 : 0.16))
    voice.triggerAttackRelease(midi === 78 ? 760 : 520, midi === 78 ? 0.08 : 0.18, now, velocity * 0.58)
    disposeLater(voice, 260)
  }

  function playTriangle(midi: number, velocity: number) {
    playMetal(midi === 80 ? 0.18 : 0.58, velocity * 0.48, 1450, {
      harmonicity: 9.2,
      modulationIndex: 9,
      resonance: 8200,
      octaves: 0.35,
    })
  }

  function playDrumHit(note: number, velocity = 0.75) {
    if (disposed) return
    const midi = getMidiFromNoteInput(note)
    const level = isPreview ? Math.min(0.75, velocity) : velocity

    if (midi === 35 || midi === 36) {
      playKick(midi, level)
      return
    }

    if (midi === 38 || midi === 40 || midi === 37 || midi === 39) {
      playSnare(midi, level)
      return
    }

    if (midi === 42 || midi === 44 || midi === 46) {
      playHat(midi, level)
      return
    }

    if ([41, 43, 45, 47, 48, 50].includes(midi)) {
      playTom(midi, level)
      return
    }

    if (midi === 54) {
      playTambourine(level)
      return
    }

    if (midi === 56) {
      playCowbell(level)
      return
    }

    if (midi === 58) {
      playVibraslap(level)
      return
    }

    if (midi >= 49 && midi <= 59) {
      playCymbal(midi, level)
      return
    }

    if (midi >= 60 && midi <= 66) {
      playHandDrum(midi, level)
      return
    }

    if (midi === 67 || midi === 68) {
      playAgogo(midi, level)
      return
    }

    if (midi === 69 || midi === 70) {
      playShaker(midi, level)
      return
    }

    if (midi === 71 || midi === 72) {
      playWhistle(midi, level)
      return
    }

    if (midi === 73 || midi === 74) {
      playScraper(midi, level)
      return
    }

    if (midi === 75 || midi === 76 || midi === 77) {
      playWood(midi, level)
      return
    }

    if (midi === 78 || midi === 79) {
      playCuica(midi, level)
      return
    }

    if (midi === 80 || midi === 81) {
      playTriangle(midi, level)
      return
    }

    playNoise(0.08, level * 0.7, { attack: 0.001, decay: 0.08, sustain: 0.01, release: 0.025 }, 'white')
  }

  return {
    expectsMidi: true,
    triggerAttackRelease(note, _duration, _time, velocity) {
      if (disposed) return
      playDrumHit(note, velocity)
    },
    triggerAttack(note, _time, velocity) {
      if (disposed) return
      playDrumHit(note, velocity)
    },
    triggerRelease() {},
    dispose() {
      if (disposed) return
      disposed = true
      activeTimeouts.forEach((timeoutId) => window.clearTimeout(timeoutId))
      activeTimeouts.clear()
      activeVoices.forEach((voice) => voice.dispose())
      activeVoices.clear()
    },
  }
}

function wrapPolySynthInstrument(synth: Tone.PolySynth): BeginnerInstrument {
  let disposed = false

  return {
    triggerAttackRelease(note, duration, time, velocity) {
      if (disposed) return
      return synth.triggerAttackRelease(note, duration, time, velocity)
    },
    triggerAttack(note, time, velocity) {
      if (disposed) return
      return synth.triggerAttack(note, time, velocity)
    },
    triggerRelease(note, time) {
      if (disposed) return
      if (note === undefined) {
        return synth.releaseAll(time)
      }
      return synth.triggerRelease(note, time)
    },
    dispose() {
      if (disposed) return
      disposed = true
      const now = Tone.now()
      synth.releaseAll(now)
      synth.volume.cancelScheduledValues(now)
      synth.volume.setValueAtTime(-96, now)
      synth.dispose()
    },
  }
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
  const createWrappedPolySynth = (options: ConstructorParameters<typeof Tone.PolySynth>[0]) =>
    wrapPolySynthInstrument(new Tone.PolySynth(options).toDestination())

  if (isDrumInstrument(instrumentId)) {
    return createWrappedPolySynth({
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
    })
  }

  if (program !== null && program < 8) {
    return createWrappedPolySynth({
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
    })
  }

  if (program !== null && program >= 8 && program < 16) {
    return createWrappedPolySynth({
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
    })
  }

  if (program !== null && program >= 16 && program < 24) {
    return createWrappedPolySynth({
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
    })
  }

  if (program !== null && program >= 24 && program < 32) {
    return createWrappedPolySynth({
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
    })
  }

  if (instrumentId === 'bass' || (program !== null && program >= 32 && program <= 39)) {
    return createWrappedPolySynth({
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
    })
  }

  if (program !== null && program >= 40 && program < 56) {
    return createWrappedPolySynth({
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
    })
  }

  if (instrumentId === 'brass' || (program !== null && program >= 56 && program <= 63)) {
    return createWrappedPolySynth({
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
    })
  }

  if (program !== null && program >= 64 && program < 80) {
    return createWrappedPolySynth({
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
    })
  }

  if (
    instrumentId === 'synth' ||
    (program !== null && ((program >= 80 && program <= 103) || program >= 120))
  ) {
    return createWrappedPolySynth({
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
    })
  }

  if (program !== null && program >= 104 && program < 112) {
    return createWrappedPolySynth({
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
    })
  }

  if (program !== null && program >= 112 && program < 120) {
    return createWrappedPolySynth({
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
    })
  }

  return createWrappedPolySynth({
    voice: Tone.Synth,
    maxPolyphony: isPreview ? 2 : 24,
    options: {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.004, decay: 0.14, sustain: 0.24, release: release(0.85) },
    },
  })
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

    const noteInput = instrument.expectsMidi
      ? note.pitch
      : Tone.Frequency(note.pitch, 'midi').toFrequency()

    instrument.triggerAttackRelease(
      noteInput,
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

      const noteInput = instrument.expectsMidi
        ? note.pitch
        : Tone.Frequency(note.pitch, 'midi').toFrequency()

      instrument.triggerAttackRelease(
        noteInput,
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
  const noteInput = instrument.expectsMidi ? pitch : Tone.Frequency(pitch, 'midi').toFrequency()
  instrument.triggerAttack(noteInput, Tone.now(), velocity)
  return { instrument, pitch, startedAtMs: performance.now() }
}

export function stopPreviewNote(preview: HeldPreview | null) {
  if (!preview) return
  const remainingMs = Math.max(0, MIN_PREVIEW_MS - (performance.now() - preview.startedAtMs))

  window.setTimeout(() => {
    const noteInput = preview.instrument.expectsMidi
      ? preview.pitch
      : Tone.Frequency(preview.pitch, 'midi').toFrequency()
    preview.instrument.triggerRelease(noteInput, Tone.now())
    window.setTimeout(() => preview.instrument.dispose(), 120)
  }, remainingMs)
}

export function stopPreviewNoteImmediately(preview: HeldPreview | null) {
  if (!preview) return
  preview.instrument.triggerRelease(undefined, Tone.now())
  preview.instrument.dispose()
}

export function disposePreviewNote(preview: HeldPreview | null) {
  if (!preview) return
  const remainingMs = Math.max(0, MIN_PREVIEW_MS - (performance.now() - preview.startedAtMs))
  window.setTimeout(() => preview.instrument.dispose(), remainingMs)
}

export function stopAllPreviewAudio() {
  oneShotPreviewToken += 1
  if (activeOneShotPreview) {
    window.clearTimeout(activeOneShotPreview.timeoutId)
    activeOneShotPreview.instrument.triggerRelease(undefined, Tone.now())
    activeOneShotPreview.instrument.dispose()
    activeOneShotPreview = null
  }
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
  const noteInput = preview.instrument.expectsMidi ? pitch : Tone.Frequency(pitch, 'midi').toFrequency()
  preview.instrument.triggerAttack(noteInput, now + 0.015, velocity)
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

  const noteInput = instrument.expectsMidi ? pitch : Tone.Frequency(pitch, 'midi').toFrequency()
  instrument.triggerAttackRelease(
    noteInput,
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
