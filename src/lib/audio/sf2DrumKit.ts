import * as Tone from 'tone'
import type { BeginnerInstrument, InstrumentMode } from './toneTransport'

export type DrumKitStyle = 'power' | 'standard'

const DRUM_SOUNDFONT_URLS: Record<DrumKitStyle, string[]> = {
  power: [
  '/soundfonts/DrumSetJDRockset5.sf2',
  '/soundfonts/TamaRockSTAR.sf2',
  '/soundfonts/Elementic.sf2',
  '/soundfonts/Standard_Dum_Kit__by_Charlie.SF2',
  ],
  standard: [
    '/soundfonts/Standard_Dum_Kit__by_Charlie.SF2',
    '/soundfonts/Elementic.sf2',
    '/soundfonts/TamaRockSTAR.sf2',
    '/soundfonts/DrumSetJDRockset5.sf2',
  ],
}
const DRUM_SOUNDFONT_GAIN = 1.35
const DRUM_RELEASE_SECONDS = 0.045
const DRUM_READY_TIMEOUT_MS = 7000

type Sf2Chunk = {
  offset: number
  size: number
}

type GeneratorMap = Partial<Record<number, number>>

type Bag = {
  genIndex: number
}

type Preset = {
  name: string
  bank: number
  bagIndex: number
}

type Instrument = {
  name: string
  bagIndex: number
}

type SampleHeader = {
  name: string
  start: number
  end: number
  sampleRate: number
  originalPitch: number
  pitchCorrection: number
}

type DrumSampleZone = {
  highKey: number
  lowKey: number
  highVel: number
  lowVel: number
  rootKey: number
  sample: SampleHeader
  attenuation: number
}

type ParsedDrumKit = {
  buffers: Map<string, AudioBuffer>
  sampleData: DataView
  sourceUrl: string
  zonesByKey: Map<number, DrumSampleZone[]>
}

type ActiveSample = {
  gain: GainNode
  minimumReleaseAt: number
  source: AudioBufferSourceNode
}

const drumKitReady = new Map<DrumKitStyle, Promise<ParsedDrumKit>>()
const cachedDrumKits = new Map<DrumKitStyle, ParsedDrumKit>()
const failedToLoad = new Set<DrumKitStyle>()

function readName(view: DataView, offset: number, length: number) {
  let text = ''
  for (let index = 0; index < length; index += 1) {
    const code = view.getUint8(offset + index)
    if (code === 0) break
    text += String.fromCharCode(code)
  }
  return text.trim()
}

function signedInt16FromUint16(value: number) {
  return value > 0x7fff ? value - 0x10000 : value
}

function signedInt8(value: number) {
  return value > 0x7f ? value - 0x100 : value
}

function findTopLevelList(view: DataView, listType: string): Sf2Chunk | null {
  if (readName(view, 0, 4) !== 'RIFF' || readName(view, 8, 4) !== 'sfbk') return null

  let offset = 12
  while (offset + 12 <= view.byteLength) {
    const id = readName(view, offset, 4)
    const size = view.getUint32(offset + 4, true)
    if (id === 'LIST' && readName(view, offset + 8, 4) === listType) {
      return { offset: offset + 12, size: size - 4 }
    }
    offset += 8 + size + (size % 2)
  }

  return null
}

function collectSubChunks(view: DataView, list: Sf2Chunk) {
  const chunks = new Map<string, Sf2Chunk>()
  let offset = list.offset
  const end = list.offset + list.size

  while (offset + 8 <= end) {
    const id = readName(view, offset, 4)
    const size = view.getUint32(offset + 4, true)
    chunks.set(id, { offset: offset + 8, size })
    offset += 8 + size + (size % 2)
  }

  return chunks
}

function requireChunk(chunks: Map<string, Sf2Chunk>, id: string) {
  const chunk = chunks.get(id)
  if (!chunk) throw new Error(`SF2 ${id} chunk missing`)
  return chunk
}

function parseBags(view: DataView, chunk: Sf2Chunk): Bag[] {
  const bags: Bag[] = []
  for (let offset = chunk.offset; offset < chunk.offset + chunk.size; offset += 4) {
    bags.push({ genIndex: view.getUint16(offset, true) })
  }
  return bags
}

function parseGenerators(view: DataView, chunk: Sf2Chunk): GeneratorMap[] {
  const generators: GeneratorMap[] = []
  for (let offset = chunk.offset; offset < chunk.offset + chunk.size; offset += 4) {
    const operator = view.getUint16(offset, true)
    const rawAmount = view.getUint16(offset + 2, true)
    generators.push({ [operator]: rawAmount })
  }
  return generators
}

function mergeGeneratorRange(generators: GeneratorMap[], start: number, end: number) {
  const merged: GeneratorMap = {}
  for (let index = start; index < end; index += 1) {
    Object.assign(merged, generators[index])
  }
  return merged
}

function parsePresets(view: DataView, chunk: Sf2Chunk): Preset[] {
  const presets: Preset[] = []
  for (let offset = chunk.offset; offset < chunk.offset + chunk.size; offset += 38) {
    presets.push({
      name: readName(view, offset, 20),
      bank: view.getUint16(offset + 22, true),
      bagIndex: view.getUint16(offset + 24, true),
    })
  }
  return presets
}

function parseInstruments(view: DataView, chunk: Sf2Chunk): Instrument[] {
  const instruments: Instrument[] = []
  for (let offset = chunk.offset; offset < chunk.offset + chunk.size; offset += 22) {
    instruments.push({
      name: readName(view, offset, 20),
      bagIndex: view.getUint16(offset + 20, true),
    })
  }
  return instruments
}

function parseSampleHeaders(view: DataView, chunk: Sf2Chunk): SampleHeader[] {
  const samples: SampleHeader[] = []
  for (let offset = chunk.offset; offset < chunk.offset + chunk.size; offset += 46) {
    samples.push({
      name: readName(view, offset, 20),
      start: view.getUint32(offset + 20, true),
      end: view.getUint32(offset + 24, true),
      sampleRate: view.getUint32(offset + 36, true) || 44100,
      originalPitch: view.getUint8(offset + 40),
      pitchCorrection: signedInt8(view.getUint8(offset + 41)),
    })
  }
  return samples
}

function getKeyRange(generators: GeneratorMap) {
  const rawRange = generators[43]
  if (rawRange === undefined) return { lowKey: 0, highKey: 127 }
  return {
    lowKey: rawRange & 0xff,
    highKey: (rawRange >> 8) & 0xff,
  }
}

function getAttenuation(generators: GeneratorMap) {
  const raw = generators[48]
  return raw === undefined ? 0 : signedInt16FromUint16(raw)
}

function getVelocityRange(generators: GeneratorMap) {
  const rawRange = generators[44]
  if (rawRange === undefined) return { lowVel: 1, highVel: 127 }
  return {
    lowVel: Math.max(1, rawRange & 0xff),
    highVel: Math.max(1, (rawRange >> 8) & 0xff),
  }
}

function pickPreset(presets: Preset[]) {
  const candidates = presets
    .map((preset, index) => ({ index, preset, score: getPresetScore(preset) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)

  return candidates[0]?.preset ?? presets[0]
}

function getPresetScore(preset: Preset) {
  const name = preset.name.toLowerCase()
  let score = 0
  if (preset.bank === 128) score += 100
  if (name.includes('rock')) score += 35
  if (name.includes('tama')) score += 24
  if (name.includes('jd')) score += 18
  if (name.includes('drum')) score += 12
  if (name.includes('kit')) score += 10
  if (name.includes('standard')) score += 4
  return score
}

function buildZones(
  preset: Preset,
  nextPreset: Preset,
  presetBags: Bag[],
  presetGenerators: GeneratorMap[],
  instruments: Instrument[],
  instrumentBags: Bag[],
  instrumentGenerators: GeneratorMap[],
  samples: SampleHeader[],
) {
  const zones: DrumSampleZone[] = []

  for (let presetBagIndex = preset.bagIndex; presetBagIndex < nextPreset.bagIndex; presetBagIndex += 1) {
    const bag = presetBags[presetBagIndex]
    const nextBag = presetBags[presetBagIndex + 1]
    if (!bag || !nextBag) continue

    const presetZone = mergeGeneratorRange(
      presetGenerators,
      bag.genIndex,
      nextBag.genIndex,
    )
    const instrumentIndex = presetZone[41]
    if (instrumentIndex === undefined) continue

    const instrument = instruments[instrumentIndex]
    const nextInstrument = instruments[instrumentIndex + 1]
    if (!instrument || !nextInstrument) continue

    for (
      let instrumentBagIndex = instrument.bagIndex;
      instrumentBagIndex < nextInstrument.bagIndex;
      instrumentBagIndex += 1
    ) {
      const instrumentBag = instrumentBags[instrumentBagIndex]
      const nextInstrumentBag = instrumentBags[instrumentBagIndex + 1]
      if (!instrumentBag || !nextInstrumentBag) continue

      const instrumentZone = mergeGeneratorRange(
        instrumentGenerators,
        instrumentBag.genIndex,
        nextInstrumentBag.genIndex,
      )
      const sampleIndex = instrumentZone[53]
      if (sampleIndex === undefined) continue

      const sample = samples[sampleIndex]
      if (!sample || sample.name === 'EOS' || sample.end <= sample.start) continue

      const presetRange = getKeyRange(presetZone)
      const instrumentRange = getKeyRange(instrumentZone)
      const presetVelRange = getVelocityRange(presetZone)
      const instrumentVelRange = getVelocityRange(instrumentZone)
      const lowKey = Math.max(presetRange.lowKey, instrumentRange.lowKey)
      const highKey = Math.min(presetRange.highKey, instrumentRange.highKey)
      const lowVel = Math.max(presetVelRange.lowVel, instrumentVelRange.lowVel)
      const highVel = Math.min(presetVelRange.highVel, instrumentVelRange.highVel)
      if (lowKey > highKey) continue
      if (lowVel > highVel) continue

      const overridingRootKey = instrumentZone[58]
      const rootKey =
        overridingRootKey !== undefined && overridingRootKey <= 127
          ? overridingRootKey
          : lowKey === highKey
            ? lowKey
            : sample.originalPitch || lowKey

      zones.push({
        highKey,
        lowKey,
        highVel,
        lowVel,
        rootKey,
        sample,
        attenuation: getAttenuation(presetZone) + getAttenuation(instrumentZone),
      })
    }
  }

  return zones
}

async function loadDrumKit(style: DrumKitStyle) {
  const cached = cachedDrumKits.get(style)
  if (cached) return cached
  if (failedToLoad.has(style)) throw new Error('Drum SF2 load failed')
  const pending = drumKitReady.get(style)
  if (pending) return pending

  const ready = loadFirstAvailableDrumKit(style)
    .then((kit) => {
      cachedDrumKits.set(style, kit)
      return kit
    })
    .catch((error) => {
      failedToLoad.add(style)
      drumKitReady.delete(style)
      throw error
    })
  drumKitReady.set(style, ready)

  return ready
}

async function loadFirstAvailableDrumKit(style: DrumKitStyle) {
  const errors: string[] = []

  for (const sourceUrl of DRUM_SOUNDFONT_URLS[style]) {
    try {
      const response = await fetch(sourceUrl)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const buffer = await response.arrayBuffer()
      const view = new DataView(buffer)
      const sdta = findTopLevelList(view, 'sdta')
      const pdta = findTopLevelList(view, 'pdta')
      if (!sdta || !pdta) throw new Error('Invalid drum SF2')

      const sdtaChunks = collectSubChunks(view, sdta)
      const pdtaChunks = collectSubChunks(view, pdta)
      const sampleChunk = requireChunk(sdtaChunks, 'smpl')
      const presets = parsePresets(view, requireChunk(pdtaChunks, 'phdr'))
      const presetBags = parseBags(view, requireChunk(pdtaChunks, 'pbag'))
      const presetGenerators = parseGenerators(view, requireChunk(pdtaChunks, 'pgen'))
      const instruments = parseInstruments(view, requireChunk(pdtaChunks, 'inst'))
      const instrumentBags = parseBags(view, requireChunk(pdtaChunks, 'ibag'))
      const instrumentGenerators = parseGenerators(view, requireChunk(pdtaChunks, 'igen'))
      const samples = parseSampleHeaders(view, requireChunk(pdtaChunks, 'shdr'))
      const preset = pickPreset(presets.slice(0, -1))
      const presetIndex = presets.indexOf(preset)
      const nextPreset = presets[presetIndex + 1]
      if (!preset || !nextPreset) throw new Error('Drum preset missing')

      const zones = buildZones(
        preset,
        nextPreset,
        presetBags,
        presetGenerators,
        instruments,
        instrumentBags,
        instrumentGenerators,
        samples,
      )
      const zonesByKey = new Map<number, DrumSampleZone[]>()
      zones.forEach((zone) => {
        for (let key = zone.lowKey; key <= zone.highKey; key += 1) {
          const keyZones = zonesByKey.get(key) ?? []
          keyZones.push(zone)
          zonesByKey.set(key, keyZones)
        }
      })

      if (zonesByKey.size === 0) throw new Error('Drum samples missing')

      return {
        buffers: new Map(),
        sampleData: new DataView(buffer, sampleChunk.offset, sampleChunk.size),
        sourceUrl,
        zonesByKey,
      }
    } catch (error) {
      errors.push(`${sourceUrl}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  throw new Error(`No drum SF2 loaded. ${errors.join(' / ')}`)
}

function getUsableSampleRate(sampleRate: number) {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) {
    return 44100
  }
  return sampleRate
}

function createAudioBuffer(kit: ParsedDrumKit, sample: SampleHeader) {
  const cacheKey = `${kit.sourceUrl}:${sample.name}:${sample.start}:${sample.end}`
  const cached = kit.buffers.get(cacheKey)
  if (cached) return cached

  const rawLength = Math.max(1, sample.end - sample.start)
  const context = Tone.getContext().rawContext
  const buffer = context.createBuffer(1, rawLength, getUsableSampleRate(sample.sampleRate))
  const output = buffer.getChannelData(0)

  for (let index = 0; index < rawLength; index += 1) {
    const byteOffset = (sample.start + index) * 2
    if (byteOffset + 1 >= kit.sampleData.byteLength) break
    output[index] = kit.sampleData.getInt16(byteOffset, true) / 32768
  }

  kit.buffers.set(cacheKey, buffer)
  return buffer
}

function getNow() {
  return Tone.getContext().rawContext.currentTime
}

function getMinimumDrumHitSeconds(midi: number) {
  if (midi === 35 || midi === 36) return 0.32
  if (midi === 38 || midi === 39 || midi === 40) return 0.42
  if (midi === 42 || midi === 44) return 0.18
  if (midi === 46) return 0.55
  if (midi >= 41 && midi <= 50) return 0.44
  if (midi === 49 || midi === 51 || midi === 52 || midi === 55 || midi === 57 || midi === 59) return 0.9
  if (midi >= 65 && midi <= 81) return 0.36
  return 0.28
}

function stopSample(sample: ActiveSample, time = getNow(), force = false) {
  const stopAt = Math.max(time, getNow())
  if (!force && stopAt < sample.minimumReleaseAt) {
    window.setTimeout(() => stopSample(sample, sample.minimumReleaseAt), Math.ceil((sample.minimumReleaseAt - stopAt) * 1000))
    return
  }

  sample.gain.gain.cancelScheduledValues(stopAt)
  sample.gain.gain.setTargetAtTime(0.0001, stopAt, 0.012)
  try {
    sample.source.stop(stopAt + DRUM_RELEASE_SECONDS)
  } catch {
    // The source may already be stopped by its natural ending.
  }
}

function playSample(
  kit: ParsedDrumKit,
  midi: number,
  velocity: number,
  rrIndexByKey: Map<number, number>,
  time?: number,
  outputNode?: AudioNode,
) {
  const zones = kit.zonesByKey.get(midi)
  if (!zones || zones.length === 0) return null

  const velocityMidi = Math.max(1, Math.min(127, Math.round(velocity * 127)))
  const matching = zones.filter((zone) => velocityMidi >= zone.lowVel && velocityMidi <= zone.highVel)
  const zonePool = matching.length > 0 ? matching : zones
  const sorted = [...zonePool].sort((left, right) => getZoneQualityScore(right, midi) - getZoneQualityScore(left, midi))
  const topScore = getZoneQualityScore(sorted[0], midi)
  const preferred = sorted.filter((zone) => getZoneQualityScore(zone, midi) === topScore)
  const nextIndex = rrIndexByKey.get(midi) ?? 0
  const zone = preferred[nextIndex % preferred.length]
  rrIndexByKey.set(midi, nextIndex + 1)

  const context = Tone.getContext().rawContext
  const source = context.createBufferSource()
  const gain = context.createGain()
  const buffer = createAudioBuffer(kit, zone.sample)
  const startAt = Math.max(time ?? getNow(), getNow())
  const attenuationGain = Math.pow(10, -Math.max(0, zone.attenuation) / 200)

  source.buffer = buffer
  source.playbackRate.value = 1
  gain.gain.setValueAtTime(Math.min(1.4, velocity * DRUM_SOUNDFONT_GAIN * attenuationGain), startAt)
  source.connect(gain)
  gain.connect(outputNode ?? context.destination)
  source.start(startAt)

  const active = { gain, minimumReleaseAt: startAt + getMinimumDrumHitSeconds(midi), source }
  source.onended = () => {
    source.disconnect()
    gain.disconnect()
  }

  return active
}

function getZoneQualityScore(zone: DrumSampleZone, midi: number) {
  const name = zone.sample.name.toLowerCase()
  let score = 0
  if (name.includes('dry')) score += 6
  if (name.includes('(l)')) score += 3
  if (name.includes('(r)')) score -= 2
  if (name.includes('wet')) score -= 5
  if (name.startsWith('__')) score -= 2
  if (name.includes('real')) score += 2

  if (midi === 35 || midi === 36) {
    if (name.includes('kick') || name.includes('bass')) score += 3
  } else if (midi === 38 || midi === 40) {
    if (name.includes('snare')) score += 3
  } else if (midi === 42 || midi === 44 || midi === 46) {
    if (name.includes('hat')) score += 3
  } else if (midi === 49 || midi === 51 || midi === 57) {
    if (name.includes('cym') || name.includes('crash') || name.includes('ride')) score += 3
  }

  return score
}

export function createSf2DrumKitInstrument(
  mode: InstrumentMode,
  fallback: BeginnerInstrument,
  style: DrumKitStyle = 'power',
): BeginnerInstrument {
  const activeSamples = new Map<number, Set<ActiveSample>>()
  const rrIndexByKey = new Map<number, number>()
  const ready = loadDrumKit(style)
    .then(() => undefined)
    .catch(() => undefined)
  let outputNode: AudioNode | null = null
  let disposed = false

  function addActive(note: number, sample: ActiveSample) {
    const samples = activeSamples.get(note) ?? new Set<ActiveSample>()
    samples.add(sample)
    activeSamples.set(note, samples)
    sample.source.onended = () => {
      samples.delete(sample)
      if (samples.size === 0) activeSamples.delete(note)
      sample.source.disconnect()
      sample.gain.disconnect()
    }
  }

  function triggerSf2(note: number, time?: number, velocity = 0.75) {
    const kit = cachedDrumKits.get(style)
    if (!kit) return false

    const midi = Math.round(note)
    const adjustedVelocity = mode === 'preview' ? Math.min(0.78, velocity) : velocity
    const sample = playSample(kit, midi, adjustedVelocity, rrIndexByKey, time, outputNode ?? undefined)
    if (!sample) return false

    addActive(midi, sample)
    return true
  }

  return {
    connect(node) {
      outputNode = ((node as any).input ?? node) as AudioNode
      fallback.connect?.(node)
      return node
    },
    disconnect() {
      outputNode = null
      fallback.disconnect?.()
      return undefined
    },
    expectsMidi: true,
    readyTimeoutMs: DRUM_READY_TIMEOUT_MS,
    ready,
    triggerAttackRelease(note, duration, time, velocity = 0.75) {
      if (disposed) return undefined
      if (!triggerSf2(note, time, velocity)) {
        return fallback.triggerAttackRelease(note, Math.max(duration, getMinimumDrumHitSeconds(Math.round(note))), time, velocity)
      }
      return undefined
    },
    triggerAttack(note, time, velocity = 0.75) {
      if (disposed) return undefined
      if (!triggerSf2(note, time, velocity)) {
        return fallback.triggerAttack(note, time, velocity)
      }
      return undefined
    },
    triggerRelease(note, time) {
      fallback.triggerRelease(note, time)
      if (note === undefined) {
        activeSamples.forEach((samples) => {
          samples.forEach((sample) => stopSample(sample, time, true))
        })
        activeSamples.clear()
        return undefined
      }

      const midi = Math.round(note)
      const samples = activeSamples.get(midi)
      if (!samples) return undefined
      samples.forEach((sample) => stopSample(sample, time))
      activeSamples.delete(midi)
      return undefined
    },
    dispose() {
      if (disposed) return
      disposed = true
      activeSamples.forEach((samples) => {
        samples.forEach((sample) => stopSample(sample, getNow(), true))
      })
      activeSamples.clear()
      fallback.dispose()
    },
  }
}
