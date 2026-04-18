import type { InstrumentId } from '../../types/music'

const GM_NAMES = [
  'Acoustic Grand Piano',
  'Bright Acoustic Piano',
  'Electric Grand Piano',
  'Honky-tonk Piano',
  'Electric Piano 1',
  'Electric Piano 2',
  'Harpsichord',
  'Clavinet',
  'Celesta',
  'Glockenspiel',
  'Music Box',
  'Vibraphone',
  'Marimba',
  'Xylophone',
  'Tubular Bells',
  'Dulcimer',
  'Drawbar Organ',
  'Percussive Organ',
  'Rock Organ',
  'Church Organ',
  'Reed Organ',
  'Accordion',
  'Harmonica',
  'Tango Accordion',
  'Acoustic Guitar Nylon',
  'Acoustic Guitar Steel',
  'Electric Guitar Jazz',
  'Electric Guitar Clean',
  'Electric Guitar Muted',
  'Overdriven Guitar',
  'Distortion Guitar',
  'Guitar Harmonics',
  'Acoustic Bass',
  'Electric Bass Finger',
  'Electric Bass Pick',
  'Fretless Bass',
  'Slap Bass 1',
  'Slap Bass 2',
  'Synth Bass 1',
  'Synth Bass 2',
  'Violin',
  'Viola',
  'Cello',
  'Contrabass',
  'Tremolo Strings',
  'Pizzicato Strings',
  'Orchestral Harp',
  'Timpani',
  'String Ensemble 1',
  'String Ensemble 2',
  'Synth Strings 1',
  'Synth Strings 2',
  'Choir Aahs',
  'Voice Oohs',
  'Synth Voice',
  'Orchestra Hit',
  'Trumpet',
  'Trombone',
  'Tuba',
  'Muted Trumpet',
  'French Horn',
  'Brass Section',
  'Synth Brass 1',
  'Synth Brass 2',
  'Soprano Sax',
  'Alto Sax',
  'Tenor Sax',
  'Baritone Sax',
  'Oboe',
  'English Horn',
  'Bassoon',
  'Clarinet',
  'Piccolo',
  'Flute',
  'Recorder',
  'Pan Flute',
  'Blown Bottle',
  'Shakuhachi',
  'Whistle',
  'Ocarina',
  'Lead 1 Square',
  'Lead 2 Sawtooth',
  'Lead 3 Calliope',
  'Lead 4 Chiff',
  'Lead 5 Charang',
  'Lead 6 Voice',
  'Lead 7 Fifths',
  'Lead 8 Bass + Lead',
  'Pad 1 New Age',
  'Pad 2 Warm',
  'Pad 3 Polysynth',
  'Pad 4 Choir',
  'Pad 5 Bowed',
  'Pad 6 Metallic',
  'Pad 7 Halo',
  'Pad 8 Sweep',
  'FX 1 Rain',
  'FX 2 Soundtrack',
  'FX 3 Crystal',
  'FX 4 Atmosphere',
  'FX 5 Brightness',
  'FX 6 Fantasy',
  'FX 7 Echoes',
  'FX 8 Sci-fi',
  'Sitar',
  'Banjo',
  'Shamisen',
  'Koto',
  'Kalimba',
  'Bagpipe',
  'Fiddle',
  'Shanai',
  'Tinkle Bell',
  'Agogo',
  'Steel Drums',
  'Woodblock',
  'Taiko Drum',
  'Melodic Tom',
  'Synth Drum',
  'Reverse Cymbal',
  'Guitar Fret Noise',
  'Breath Noise',
  'Seashore',
  'Bird Tweet',
  'Telephone Ring',
  'Helicopter',
  'Applause',
  'Gunshot',
] as const

export type GeneralMidiInstrument = {
  family: string
  icon: string
  id: InstrumentId
  label: string
  program: number
}

function getFamily(program: number) {
  if (program < 8) return 'Piano'
  if (program < 16) return 'Chromatic'
  if (program < 24) return 'Organ'
  if (program < 32) return 'Guitar'
  if (program < 40) return 'Bass'
  if (program < 48) return 'Strings'
  if (program < 56) return 'Ensemble'
  if (program < 64) return 'Brass'
  if (program < 72) return 'Reed'
  if (program < 80) return 'Pipe'
  if (program < 88) return 'Lead'
  if (program < 96) return 'Pad'
  if (program < 104) return 'FX'
  if (program < 112) return 'Ethnic'
  if (program < 120) return 'Percussive'
  return 'Sound FX'
}

export function getInstrumentIcon(instrumentId: InstrumentId) {
  const program = getProgramFromInstrumentId(instrumentId)
  if (instrumentId === 'drums') return '◉'
  if (program === null) return '◇'
  if (program < 8) return '▥'
  if (program < 16) return '✦'
  if (program < 24) return '▤'
  if (program < 32) return '◒'
  if (program < 40) return '▰'
  if (program < 56) return '♮'
  if (program < 64) return '◢'
  if (program < 80) return '♬'
  if (program < 104) return '◇'
  if (program < 120) return '◆'
  return '●'
}

export function getProgramFromInstrumentId(instrumentId: InstrumentId) {
  if (instrumentId.startsWith('gm-')) {
    const program = Number(instrumentId.slice(3))
    return Number.isInteger(program) && program >= 0 && program <= 127 ? program : null
  }

  const legacyMap: Record<string, number> = {
    piano: 0,
    bass: 33,
    synth: 80,
    brass: 62,
  }

  return legacyMap[instrumentId] ?? null
}

export function getInstrumentLabel(instrumentId: InstrumentId) {
  if (instrumentId === 'drums') return 'Power Drum Kit'
  const program = getProgramFromInstrumentId(instrumentId)
  return program === null ? 'Clean Synth' : GM_NAMES[program]
}

export function getSoundFontInstrumentName(instrumentId: InstrumentId) {
  if (instrumentId === 'drums') return null
  const program = getProgramFromInstrumentId(instrumentId)
  if (program === null) return null

  return GM_NAMES[program]
    .toLowerCase()
    .replace(/\+/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function getInstrumentImage(instrumentId: InstrumentId) {
  const program = getProgramFromInstrumentId(instrumentId)
  if (instrumentId === 'drums') return '/instrument-icons/drums.svg'
  if (program === null) return '/instrument-icons/synth.svg'
  if (program < 8) return '/instrument-icons/piano.svg'
  if (program < 16) return '/instrument-icons/percussion.svg'
  if (program < 24) return '/instrument-icons/organ.svg'
  if (program < 32) return '/instrument-icons/guitar.svg'
  if (program < 40) return '/instrument-icons/bass.svg'
  if (program < 56) return '/instrument-icons/strings.svg'
  if (program < 64) return '/instrument-icons/brass.svg'
  if (program < 80) return '/instrument-icons/woodwind.svg'
  if (program < 104) return '/instrument-icons/synth.svg'
  if (program < 120) return '/instrument-icons/percussion.svg'
  return '/instrument-icons/fx.svg'
}

export const GENERAL_MIDI_INSTRUMENTS: GeneralMidiInstrument[] = GM_NAMES.map((label, program) => ({
  family: getFamily(program),
  icon: getInstrumentIcon(`gm-${program}`),
  id: `gm-${program}`,
  label,
  program,
}))
