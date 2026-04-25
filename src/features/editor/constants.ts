import type { InstrumentId } from '../../types/music'
import { GENERAL_MIDI_INSTRUMENTS } from '../../lib/midi/generalMidi'

export const STORAGE_KEY = 'beginner-music-project-v1'
export const DEFAULT_BARS = 8
export const BEATS_PER_BAR = 4
export const MIN_DURATION_BEATS = 0.25
export const KEY_COLUMN_WIDTH = 64
export const ROLL_HEADER_HEIGHT = 32
export const ROLL_ROW_HEIGHT = 32
export const DEFAULT_BEAT_WIDTH = 80
export const AUTO_SAVE_DELAY_MS = 500
export const ACTIVE_EDIT_AUTO_SAVE_DELAY_MS = 1200
export const FLOAT_EPSILON = 0.0001
export const PLAYBACK_SCHEDULER_MS = 80
export const PLAYBACK_LOOKAHEAD_BEATS = 0.32
export const TEMPO_PRESETS = [60, 72, 80, 90, 100, 110, 120, 128, 140, 160, 180, 200]
export const TEMPO_INPUT_MIN = 1
export const TEMPO_INPUT_MAX = 999
export const TEMPO_GRAPH_MIN = 40
export const TEMPO_GRAPH_MAX = 220
export const TEMPO_SECTION_DEFAULT_BARS = 4
export const PLAYHEAD_SCROLL_PADDING = 160
export const NOTE_DIVISIONS = [8, 16, 32, 64, 128] as const
export const ROLL_ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const
export const DEFAULT_PROJECT_LENGTH_BEATS = DEFAULT_BARS * BEATS_PER_BAR
export const EDITING_TAIL_BARS = 128
export const EDITING_TAIL_BEATS = EDITING_TAIL_BARS * BEATS_PER_BAR
export const HISTORY_LIMIT = 80
export const PATTERN_REPEAT_GAP_BEATS = 0.25
export const NOTE_DRAG_SCROLL_OUTSIDE_THRESHOLD_PX = 18
export const NOTE_DRAG_SCROLL_MAX_STEP_PX = 8
export const NOTE_DRAG_SCROLL_SENSITIVITY_PX = 120
export const PLAYHEAD_AUTO_SCROLL_THROTTLE_MS = 120
export const KEYBOARD_INPUT_MAP: Record<string, number> = {
  KeyZ: 48,
  KeyS: 49,
  KeyX: 50,
  KeyD: 51,
  KeyC: 52,
  KeyV: 53,
  KeyG: 54,
  KeyB: 55,
  KeyH: 56,
  KeyN: 57,
  KeyJ: 58,
  KeyM: 59,
  Comma: 60,
  KeyL: 61,
  Period: 62,
  Semicolon: 63,
  Slash: 64,
  KeyQ: 60,
  Digit2: 61,
  KeyW: 62,
  Digit3: 63,
  KeyE: 64,
  KeyR: 65,
  Digit5: 66,
  KeyT: 67,
  Digit6: 68,
  KeyY: 69,
  Digit7: 70,
  KeyU: 71,
  KeyI: 72,
  Digit9: 73,
  KeyO: 74,
  Digit0: 75,
  KeyP: 76,
  BracketLeft: 77,
  Equal: 78,
  BracketRight: 79,
}
export const KEYBOARD_INPUT_CODES = Object.keys(KEYBOARD_INPUT_MAP)
export const DRUM_KEYBOARD_PITCHES = [
  36, 38, 42, 46, 41, 43, 45, 47, 48, 50,
  49, 51, 37, 39, 40, 44, 55, 57, 59, 35,
  52, 53, 54, 56, 60, 61, 62, 63, 64, 65,
  66, 67, 68, 69, 70, 71, 72, 75, 76, 81,
]
export const BASE_LOW_PITCH = 48
export const BASE_HIGH_PITCH = 84
export const PITCH_RANGE_MARGIN = 4
export const PITCHES = Array.from({ length: BASE_HIGH_PITCH - BASE_LOW_PITCH + 1 }, (_, index) => BASE_HIGH_PITCH - index)
export const DRUM_PITCHES = Array.from({ length: 62 }, (_, index) => 87 - index)
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const DRUM_LABELS: Record<number, string> = {
  26: '손가락 딱',
  27: '높은 효과음',
  28: '손바닥 탁',
  29: '긁는 소리 앞으로',
  30: '긁는 소리 뒤로',
  31: '스틱 딱',
  32: '박자 딸깍',
  33: '박자 종',
  34: '작은 킥(쿵)',
  35: '깊은 킥(둥)',
  36: '킥 드럼(쿵)',
  37: '스틱 옆치기',
  38: '스네어(탁)',
  39: '박수',
  40: '강한 스네어',
  41: '바닥 탐(낮게 둥)',
  42: '닫힌 하이햇(짧게 칙)',
  43: '낮은 탐(둥)',
  44: '발 하이햇(칙)',
  45: '중간 낮은 탐',
  46: '열린 하이햇(길게 치익)',
  47: '중간 탐',
  48: '중간 높은 탐',
  49: '크래시 심벌(쾅)',
  50: '높은 탐',
  51: '라이드 심벌(팅)',
  52: '차이나 심벌(강한 쾅)',
  53: '라이드 벨(땡)',
  54: '탬버린',
  55: '작은 심벌(짧게 쨍)',
  56: '카우벨(똑)',
  57: '두 번째 크래시(쾅)',
  58: '흔들림 효과음',
  59: '두 번째 라이드(팅)',
  60: '봉고 높게',
  61: '봉고 낮게',
  62: '콩가 막고 치기',
  63: '콩가 열고 치기',
  64: '콩가 낮게',
  65: '팀발레스 높게',
  66: '팀발레스 낮게',
  67: '아고고 높게',
  68: '아고고 낮게',
  69: '카바사(차르륵)',
  70: '마라카스(샥)',
  71: '짧은 휘파람',
  72: '긴 휘파람',
  73: '귀로 짧게 긁기',
  74: '귀로 길게 긁기',
  75: '클라베스(딱)',
  76: '우드블록 높게',
  77: '우드블록 낮게',
  78: '쿠이카 막고 내기',
  79: '쿠이카 열고 내기',
  80: '트라이앵글 막기',
  81: '트라이앵글 울리기',
  82: '셰이커(샤샥)',
  83: '방울',
  84: '나무 방울',
  85: '캐스터네츠(딱딱)',
  86: '수르도 막고 치기',
  87: '수르도 울리기',
}
export const DRUM_INSTRUMENTS = [
  { family: 'Drums', icon: '◉', id: 'drums', label: '파워 드럼 키트', program: -1 },
  { family: 'Drums', icon: '○', id: 'standard-drums', label: '스탠다드 드럼 키트', program: -1 },
]
export const INSTRUMENT_OPTIONS = [...DRUM_INSTRUMENTS, ...GENERAL_MIDI_INSTRUMENTS]
export const INSTRUMENT_CATEGORY_ORDER = [
  'Piano',
  'Chromatic',
  'Organ',
  'Guitar',
  'Bass',
  'Strings',
  'Ensemble',
  'Brass',
  'Reed',
  'Pipe',
  'Lead',
  'Pad',
  'FX',
  'Ethnic',
  'Percussive',
  'Sound FX',
  'Drums',
]
export const INSTRUMENT_CATEGORY_LABELS: Record<string, string> = {
  Piano: '피아노',
  Chromatic: '건반 타악기',
  Organ: '오르간',
  Guitar: '기타',
  Bass: '베이스',
  Strings: '현악기',
  Ensemble: '합주',
  Brass: '금관악기',
  Reed: '리드 악기',
  Pipe: '관악기',
  Lead: '신스 리드',
  Pad: '신스 패드',
  FX: '효과음 신스',
  Ethnic: '민속 악기',
  Percussive: '타악기',
  'Sound FX': '효과음',
  Drums: '드럼',
}
export const INSTRUMENT_CATEGORY_IMAGES: Record<string, InstrumentId> = {
  Piano: 'gm-0',
  Chromatic: 'gm-12',
  Organ: 'gm-16',
  Guitar: 'gm-24',
  Bass: 'gm-33',
  Strings: 'gm-40',
  Ensemble: 'gm-48',
  Brass: 'gm-56',
  Reed: 'gm-65',
  Pipe: 'gm-73',
  Lead: 'gm-80',
  Pad: 'gm-88',
  FX: 'gm-96',
  Ethnic: 'gm-104',
  Percussive: 'gm-114',
  'Sound FX': 'gm-123',
  Drums: 'drums',
}
export const TRACK_COLORS = ['#5365d9', '#21a67a', '#d69b32', '#c95c8c', '#6a78f0', '#9b6bd3']
export const AUTO_MIX_GENRE_PRESETS = [
  { id: 'default', label: '기본 균형' },
  { id: 'ballad', label: '발라드' },
  { id: 'rock', label: '록 밴드' },
  { id: 'hiphop', label: '힙합' },
  { id: 'edm', label: 'EDM' },
  { id: 'orchestra', label: '오케스트라' },
] as const
export const TERMINOLOGY_HELP = [
  {
    term: '소리 세기',
    label: '소리 세기',
    description: '음표 하나가 얼마나 세게 연주되는지 정합니다.',
  },
  {
    term: '음높이 휘기',
    label: '음높이 휘기',
    description: '음이 위아래로 미끄러지듯 변하는 느낌입니다.',
  },
  {
    term: '음량',
    label: '음량',
    description: '트랙 전체가 얼마나 크게 들리는지 정합니다.',
  },
  {
    term: '좌우 위치',
    label: '좌우 위치',
    description: '소리가 왼쪽, 가운데, 오른쪽 중 어디서 들릴지 정합니다.',
  },
  {
    term: '연주 느낌',
    label: '연주 느낌',
    description: '연주 중간의 세밀한 크기 변화를 다룹니다.',
  },
  {
    term: '떨림',
    label: '떨림',
    description: '비브라토처럼 음에 흔들림을 더하는 값입니다.',
  },
  {
    term: '음표 정보',
    label: '음표 정보',
    description: '선택한 음표의 시작, 길이, 음높이를 직접 편집합니다.',
  },
]
