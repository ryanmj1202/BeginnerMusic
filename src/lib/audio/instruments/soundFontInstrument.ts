import * as Tone from 'tone'
import {
  FLUID_SOUNDFONT_BASE_URL,
  ORCHESTRAL_SOUNDFONT_BASE_URL,
  getOnlineSoundFontBaseUrl,
  getProgramFromInstrumentId,
  getSoundFontInstrumentName,
} from '../../midi/generalMidi'
import type { InstrumentId } from '../../../types/music'
import type { BeginnerInstrument } from './instrumentTypes'
import {
  MAX_CACHED_SOUNDFONTS,
  SOUNDFONT_IDLE_CACHE_MS,
  SOUNDFONT_SAMPLE_URLS,
} from './instrumentRegistry'

type SoundFontCacheEntry = {
  activeUsers: number
  failed: boolean
  isReady: boolean
  lastUsed: number
  ready: Promise<void>
  sampler: Tone.Sampler
}

const failedSoundFonts = new Set<string>()
const soundFontCache = new Map<string, SoundFontCacheEntry>()

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
  const onlineBaseUrl = getOnlineSoundFontBaseUrl(instrumentId)
  if (onlineBaseUrl) return onlineBaseUrl

  const program = getProgramFromInstrumentId(instrumentId)
  if (program === null) return FLUID_SOUNDFONT_BASE_URL
  if (program >= 40 && program < 80) return ORCHESTRAL_SOUNDFONT_BASE_URL
  return FLUID_SOUNDFONT_BASE_URL
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
  })
  entry.sampler = sampler
  soundFontCache.set(cacheKey, entry)
  trimSoundFontCache()
  return entry
}

export function createIsolatedSoundFontInstrument(
  instrumentId: InstrumentId,
  fallback: BeginnerInstrument,
): BeginnerInstrument {
  const soundFontName = getSoundFontInstrumentName(instrumentId)
  if (!soundFontName) return fallback

  let disposed = false
  let isReady = false
  const activeNotes = new Map<number, number>()
  const releaseTimeouts = new Set<number>()
  const destination = Tone.getDestination()
  let outputNode: unknown = destination
  let resolveReady = () => {}
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve
  })
  const sampler = new Tone.Sampler({
    urls: SOUNDFONT_SAMPLE_URLS,
    baseUrl: `${getSoundFontBaseUrl(instrumentId)}${soundFontName}-mp3/`,
    onload: () => {
      isReady = true
      resolveReady()
    },
    onerror: resolveReady,
  })

  sampler.connect(destination)

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
    if (isReady) sampler.triggerRelease(note, time)
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
    ready,
    connect(node) {
      if (outputNode === node) return node
      sampler.disconnect(outputNode as any)
      sampler.connect(node as any)
      outputNode = node
      return node
    },
    disconnect() {
      if (outputNode === destination) return destination
      sampler.disconnect(outputNode as any)
      sampler.connect(destination)
      outputNode = destination
      return destination
    },
    setPitchBend(cents, time, rampSeconds = 0) {
      const detune = (sampler as any).detune
      if (!detune) return
      if (rampSeconds > 0 && typeof detune.linearRampToValueAtTime === 'function') {
        detune.linearRampToValueAtTime(cents, (time ?? Tone.now()) + rampSeconds)
        return
      }
      if (typeof detune.setValueAtTime === 'function') {
        detune.setValueAtTime(cents, time ?? Tone.now())
      } else {
        detune.value = cents
      }
    },
    triggerAttackRelease(note, duration, time, velocity) {
      if (!isReady) return fallback.triggerAttackRelease(note, duration, time, velocity)
      scheduleTrackedRelease(note, duration, time)
      return sampler.triggerAttackRelease(note, duration, time, velocity)
    },
    triggerAttack(note, time, velocity) {
      if (!isReady) return fallback.triggerAttack(note, time, velocity)
      addTrackedNote(note)
      return sampler.triggerAttack(note, time, velocity)
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
      sampler.disconnect()
      sampler.dispose()
    },
  }
}

export function createSoundFontInstrument(
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
  const destination = Tone.getDestination()
  let outputNode: unknown = destination
  entry.activeUsers += 1

  entry.sampler.connect(destination)

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
    connect(node) {
      if (outputNode === node) return node
      if (outputNode !== destination) {
        entry.sampler.disconnect(outputNode as any)
      } else {
        entry.sampler.disconnect(destination)
      }
      const target = node as any
      entry.sampler.connect(target)
      outputNode = target
      return node
    },
    disconnect() {
      if (outputNode === destination) return destination
      entry.sampler.disconnect(outputNode as any)
      outputNode = destination
      return destination
    },
    setPitchBend(cents, time, rampSeconds = 0) {
      const detune = (entry.sampler as any).detune
      if (!entry.isReady || entry.failed || !detune) return fallback.setPitchBend?.(cents, time, rampSeconds)
      if (rampSeconds > 0 && typeof detune.linearRampToValueAtTime === 'function') {
        detune.linearRampToValueAtTime(cents, (time ?? Tone.now()) + rampSeconds)
        return
      }
      if (typeof detune.setValueAtTime === 'function') {
        detune.setValueAtTime(cents, time ?? Tone.now())
      } else {
        detune.value = cents
      }
    },
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
      if (outputNode !== destination) {
        entry.sampler.disconnect(outputNode as any)
      }
      entry.activeUsers = Math.max(0, entry.activeUsers - 1)
      entry.lastUsed = performance.now()
      trimSoundFontCache()
    },
  }
}

