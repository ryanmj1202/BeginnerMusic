import {
  getProgramFromInstrumentId,
} from '../../midi/generalMidi'
import type { InstrumentId } from '../../../types/music'
import type { BasicOscillatorType } from './instrumentTypes'

export const RELEASE_BUFFER_SECONDS = 2
export const MIN_PREVIEW_MS = 250
export const SOUNDFONT_SAMPLE_URLS = {
  C2: 'C2.mp3',
  C3: 'C3.mp3',
  C4: 'C4.mp3',
  C5: 'C5.mp3',
  C6: 'C6.mp3',
}
export const SOUNDFONT_LOAD_TIMEOUT_MS = 1500
export const MAX_CACHED_SOUNDFONTS = 8
export const SOUNDFONT_IDLE_CACHE_MS = 180_000

const DRUM_INSTRUMENT_IDS = new Set<InstrumentId>(['drums', 'standard-drums'])
const OSCILLATORS: BasicOscillatorType[] = ['triangle', 'sine', 'square', 'sawtooth']

export function getVariant(program: number) {
  return program % 8
}

export function pickOscillator(program: number, offset = 0) {
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

export function isDrumInstrument(instrumentId: InstrumentId) {
  return DRUM_INSTRUMENT_IDS.has(instrumentId)
}

export function getInstrumentPreviewPitch(instrumentId: InstrumentId) {
  if (isDrumInstrument(instrumentId)) return 36

  const program = getProgramFromInstrumentId(instrumentId)
  return program === null ? 60 : getPreviewPitchForProgram(program)
}
