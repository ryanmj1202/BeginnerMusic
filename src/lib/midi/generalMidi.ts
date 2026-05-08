import type { InstrumentId } from '../../types/music'

export const FLUID_SOUNDFONT_BASE_URL = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/'
export const ORCHESTRAL_SOUNDFONT_BASE_URL = 'https://gleitz.github.io/midi-js-soundfonts/MusyngKite/'
const ONLINE_SOUNDFONT_PREFIX = 'online-sf:'

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

const GM_KO_NAMES = [
  '어쿠스틱 그랜드 피아노',
  '브라이트 어쿠스틱 피아노',
  '일렉트릭 그랜드 피아노',
  '혼키통크 피아노',
  '일렉트릭 피아노 1',
  '일렉트릭 피아노 2',
  '하프시코드',
  '클라비넷',
  '첼레스타',
  '글로켄슈필',
  '뮤직박스',
  '비브라폰',
  '마림바',
  '실로폰',
  '튜블러 벨',
  '덜시머',
  '드로바 오르간',
  '퍼커시브 오르간',
  '록 오르간',
  '처치 오르간',
  '리드 오르간',
  '아코디언',
  '하모니카',
  '탱고 아코디언',
  '나일론 기타',
  '스틸 기타',
  '재즈 일렉 기타',
  '클린 일렉 기타',
  '뮤트 일렉 기타',
  '오버드라이브 기타',
  '디스토션 기타',
  '기타 하모닉스',
  '어쿠스틱 베이스',
  '핑거 베이스',
  '피크 베이스',
  '프렛리스 베이스',
  '슬랩 베이스 1',
  '슬랩 베이스 2',
  '신스 베이스 1',
  '신스 베이스 2',
  '바이올린',
  '비올라',
  '첼로',
  '콘트라베이스',
  '트레몰로 스트링',
  '피치카토 스트링',
  '오케스트라 하프',
  '팀파니',
  '스트링 앙상블 1',
  '스트링 앙상블 2',
  '신스 스트링 1',
  '신스 스트링 2',
  '콰이어 아아',
  '보이스 우',
  '신스 보이스',
  '오케스트라 히트',
  '트럼펫',
  '트롬본',
  '튜바',
  '뮤트 트럼펫',
  '프렌치 호른',
  '브라스 섹션',
  '신스 브라스 1',
  '신스 브라스 2',
  '소프라노 색소폰',
  '알토 색소폰',
  '테너 색소폰',
  '바리톤 색소폰',
  '오보에',
  '잉글리시 호른',
  '바순',
  '클라리넷',
  '피콜로',
  '플루트',
  '리코더',
  '팬 플루트',
  '보틀 블로우',
  '샤쿠하치',
  '휘슬',
  '오카리나',
  '리드 1 스퀘어',
  '리드 2 톱니파',
  '리드 3 칼리오페',
  '리드 4 치프',
  '리드 5 차랑',
  '리드 6 보이스',
  '리드 7 피프스',
  '리드 8 베이스+리드',
  '패드 1 뉴에이지',
  '패드 2 웜',
  '패드 3 폴리신스',
  '패드 4 콰이어',
  '패드 5 보우드',
  '패드 6 메탈릭',
  '패드 7 헤일로',
  '패드 8 스윕',
  'FX 1 레인',
  'FX 2 사운드트랙',
  'FX 3 크리스털',
  'FX 4 애트모스피어',
  'FX 5 브라이트니스',
  'FX 6 판타지',
  'FX 7 에코스',
  'FX 8 사이파이',
  '시타르',
  '밴조',
  '샤미센',
  '고토',
  '칼림바',
  '백파이프',
  '피들',
  '샤나이',
  '팅클 벨',
  '아고고',
  '스틸 드럼',
  '우드블록',
  '타이코 드럼',
  '멜로딕 톰',
  '신스 드럼',
  '리버스 심벌',
  '기타 프렛 노이즈',
  '브레스 노이즈',
  '파도 소리',
  '새 지저귐',
  '전화벨',
  '헬리콥터',
  '박수',
  '총소리',
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

export function getProgramFromInstrumentId(instrumentId: InstrumentId) {
  if (isOnlineSoundFontInstrument(instrumentId)) return null

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

export function createOnlineSoundFontInstrumentId(baseUrl: string, soundFontName: string) {
  return `${ONLINE_SOUNDFONT_PREFIX}${encodeURIComponent(baseUrl)}:${encodeURIComponent(soundFontName)}`
}

export function isOnlineSoundFontInstrument(instrumentId: InstrumentId) {
  return instrumentId.startsWith(ONLINE_SOUNDFONT_PREFIX)
}

export function parseOnlineSoundFontInstrumentId(instrumentId: InstrumentId) {
  if (!isOnlineSoundFontInstrument(instrumentId)) return null
  const payload = instrumentId.slice(ONLINE_SOUNDFONT_PREFIX.length)
  const separatorIndex = payload.indexOf(':')
  if (separatorIndex < 0) return null

  return {
    baseUrl: decodeURIComponent(payload.slice(0, separatorIndex)),
    soundFontName: decodeURIComponent(payload.slice(separatorIndex + 1)),
  }
}

export function getOnlineSoundFontBaseUrl(instrumentId: InstrumentId) {
  return parseOnlineSoundFontInstrumentId(instrumentId)?.baseUrl ?? null
}

function formatSoundFontLabel(soundFontName: string) {
  return soundFontName
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function getInstrumentIcon(instrumentId: InstrumentId) {
  const program = getProgramFromInstrumentId(instrumentId)
  if (instrumentId === 'audio-track') return 'AU'
  if (instrumentId === 'drums' || instrumentId === 'standard-drums') return 'DR'
  if (program === null) return 'SY'
  if (program < 8) return 'PI'
  if (program < 16) return 'CP'
  if (program < 24) return 'OR'
  if (program < 32) return 'GT'
  if (program < 40) return 'BS'
  if (program < 56) return 'ST'
  if (program < 64) return 'BR'
  if (program < 80) return 'WD'
  if (program < 104) return 'SY'
  if (program < 120) return 'PC'
  return 'FX'
}

export function getInstrumentLabel(instrumentId: InstrumentId) {
  if (instrumentId === 'audio-track') return '오디오 파일'
  if (instrumentId === 'drums') return '파워 드럼 키트'
  if (instrumentId === 'standard-drums') return '스탠다드 드럼 키트'
  const onlineSoundFont = parseOnlineSoundFontInstrumentId(instrumentId)
  if (onlineSoundFont) return formatSoundFontLabel(onlineSoundFont.soundFontName)
  const program = getProgramFromInstrumentId(instrumentId)
  return program === null ? '기본 신스' : GM_KO_NAMES[program]
}

export function getSoundFontInstrumentName(instrumentId: InstrumentId) {
  if (instrumentId === 'audio-track') return null
  if (instrumentId === 'drums' || instrumentId === 'standard-drums') return null
  const onlineSoundFont = parseOnlineSoundFontInstrumentId(instrumentId)
  if (onlineSoundFont) return onlineSoundFont.soundFontName

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
  if (instrumentId === 'audio-track') return '/instrument-icons/fx.svg'
  if (instrumentId === 'drums' || instrumentId === 'standard-drums') return '/instrument-icons/drums.svg'
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

export const GENERAL_MIDI_INSTRUMENTS: GeneralMidiInstrument[] = GM_NAMES.map((_, program) => ({
  family: getFamily(program),
  icon: getInstrumentIcon(`gm-${program}`),
  id: `gm-${program}`,
  label: GM_KO_NAMES[program],
  program,
}))
