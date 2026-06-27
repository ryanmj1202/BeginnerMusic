import { parseOnlineWebAudioFontInstrumentId } from '../../midi/generalMidi'
import { createSf2DrumKitInstrument } from '../sf2DrumKit'
import type { InstrumentId } from '../../../types/music'
import type { BeginnerInstrument, InstrumentMode } from './instrumentTypes'
import { createDrumKitInstrument } from './drumKitInstrument'
import { isDrumInstrument } from './instrumentRegistry'
import { createIsolatedSoundFontInstrument, createSoundFontInstrument } from './soundFontInstrument'
import { createSynthInstrument } from './synthInstrument'
import { createWebAudioFontInstrument } from './webAudioFontInstrument'

export function createInstrument(
  instrumentId: InstrumentId,
  mode: InstrumentMode = 'playback',
  options: { isolatedSoundFont?: boolean; soundFont?: boolean } = {},
): BeginnerInstrument {
  if (isDrumInstrument(instrumentId)) {
    return createSf2DrumKitInstrument(
      mode,
      createDrumKitInstrument(mode),
      instrumentId === 'standard-drums' ? 'standard' : 'power',
    )
  }

  const fallback = createSynthInstrument(instrumentId, mode)
  if (parseOnlineWebAudioFontInstrumentId(instrumentId)) return createWebAudioFontInstrument(instrumentId, fallback)
  if (options.soundFont === false) return fallback
  if (options.isolatedSoundFont) return createIsolatedSoundFontInstrument(instrumentId, fallback)
  return createSoundFontInstrument(instrumentId, fallback)
}

