import * as Tone from 'tone'
import { parseOnlineWebAudioFontInstrumentId } from '../../midi/generalMidi'
import type { InstrumentId } from '../../../types/music'
import type { BeginnerInstrument } from './instrumentTypes'

type WebAudioFontZone = {
  buffer?: AudioBuffer
  coarseTune?: number
  file?: string
  fineTune?: number
  keyRangeHigh?: number
  keyRangeLow?: number
  loopEnd?: number
  loopStart?: number
  originalPitch?: number
  sample?: string
  sampleRate?: number
}

type WebAudioFontPreset = {
  zones?: WebAudioFontZone[]
}

const webAudioFontCache = new Map<string, Promise<WebAudioFontPreset>>()

function getRawAudioContext() {
  return (Tone.getContext() as unknown as { rawContext: AudioContext }).rawContext
}

async function decodeWebAudioFontSample(base64Audio: string) {
  const cleanBase64 = base64Audio.includes(',') ? base64Audio.split(',').pop() ?? '' : base64Audio
  const binary = window.atob(cleanBase64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return getRawAudioContext().decodeAudioData(bytes.buffer)
}

function loadWebAudioFontPreset(scriptUrl: string, variableName: string) {
  const cacheKey = `${scriptUrl}#${variableName}`
  const cached = webAudioFontCache.get(cacheKey)
  if (cached) return cached

  const promise = (async () => {
    const abortController = new AbortController()
    const timeoutId = window.setTimeout(() => abortController.abort(), 7000)
    const response = await fetch(scriptUrl, { signal: abortController.signal })
    window.clearTimeout(timeoutId)
    if (!response.ok) throw new Error(`WebAudioFont failed: ${response.status}`)
    const script = await response.text()
    const preset = Function(`${script}; return ${variableName};`)() as WebAudioFontPreset
    await Promise.all((preset.zones ?? []).map(async (zone) => {
      const sample = zone.sample ?? zone.file
      if (!sample) return
      zone.buffer = await decodeWebAudioFontSample(sample)
    }))
    return preset
  })()

  webAudioFontCache.set(cacheKey, promise)
  return promise
}

export function createWebAudioFontInstrument(instrumentId: InstrumentId, fallback: BeginnerInstrument): BeginnerInstrument {
  const webAudioFont = parseOnlineWebAudioFontInstrumentId(instrumentId)
  if (!webAudioFont) return fallback

  const audioContext = getRawAudioContext()
  const output = audioContext.createGain()
  output.connect(audioContext.destination)
  const activeSources = new Set<AudioBufferSourceNode>()
  let preset: WebAudioFontPreset | null = null
  let disposed = false
  const ready = loadWebAudioFontPreset(webAudioFont.scriptUrl, webAudioFont.variableName)
    .then((loadedPreset) => {
      preset = loadedPreset
    })

  function getZone(midi: number) {
    return (preset?.zones ?? []).find((zone) => (
      midi >= (zone.keyRangeLow ?? 0) && midi <= (zone.keyRangeHigh ?? 127) && zone.buffer
    )) ?? null
  }

  function play(midi: number, duration: number, time = audioContext.currentTime, velocity = 0.75) {
    if (disposed) return null
    const zone = getZone(midi)
    if (!zone?.buffer) return fallback.triggerAttackRelease(midi, duration, time, velocity)

    const source = audioContext.createBufferSource()
    const gain = audioContext.createGain()
    source.buffer = zone.buffer
    source.playbackRate.value = 2 ** (((midi * 100) - (zone.originalPitch ?? midi * 100) + ((zone.coarseTune ?? 0) * 100) + (zone.fineTune ?? 0)) / 1200)
    if (zone.loopStart && zone.loopEnd && zone.loopEnd > zone.loopStart) {
      source.loop = true
      source.loopStart = zone.loopStart / (zone.sampleRate ?? zone.buffer.sampleRate)
      source.loopEnd = zone.loopEnd / (zone.sampleRate ?? zone.buffer.sampleRate)
    }
    gain.gain.setValueAtTime(Math.max(0.0001, velocity), time)
    gain.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.05, duration))
    source.connect(gain)
    gain.connect(output)
    source.start(time)
    source.stop(time + Math.max(0.08, duration + 0.08))
    activeSources.add(source)
    source.onended = () => {
      activeSources.delete(source)
      gain.disconnect()
    }
    return source
  }

  return {
    connect: (node: unknown) => output.connect(node as AudioNode),
    disconnect: () => output.disconnect(),
    dispose: () => {
      disposed = true
      activeSources.forEach((source) => source.stop())
      activeSources.clear()
      output.disconnect()
      fallback.dispose()
    },
    expectsMidi: true,
    ready,
    readyTimeoutMs: 7500,
    triggerAttack: (note, time, velocity) => {
      if (Array.isArray(note)) {
        note.forEach((item) => play(item, 2, time, velocity))
        return
      }
      play(note, 2, time, velocity)
    },
    triggerAttackRelease: (note, duration, time, velocity) => {
      if (Array.isArray(note)) {
        note.forEach((item) => play(item, duration, time, velocity))
        return undefined
      }
      return play(note, duration, time, velocity)
    },
    triggerRelease: (note) => {
      if (Array.isArray(note)) {
        activeSources.forEach((source) => source.stop())
        activeSources.clear()
        return
      }
      activeSources.forEach((source) => source.stop())
      activeSources.clear()
    },
  }
}
