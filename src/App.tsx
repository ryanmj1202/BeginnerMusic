import {
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import './App.css'
import * as Tone from 'tone'
import { exportMp3Project } from './lib/audio/exportMp3'
import {
  changePreviewNote,
  createInstrument,
  disposePreviewNote,
  ensureAudioReady,
  getInstrumentPreviewPitch,
  isDrumInstrument,
  previewNote,
  startPreviewNote,
  stopPreviewNote,
  waitForInstrumentReady,
  type HeldPreview,
} from './lib/audio/toneTransport'
import {
  GENERAL_MIDI_INSTRUMENTS,
  getInstrumentIcon,
  getInstrumentImage,
  getInstrumentLabel,
} from './lib/midi/generalMidi'
import { exportMidiProject } from './lib/midi/exportMidi'
import { importMidiProject } from './lib/midi/importMidi'
import type { AudioClip, AutoMixSection, InstrumentId, Note, Project, Track } from './types/music'

const STORAGE_KEY = 'beginner-music-project-v1'
const DEFAULT_BARS = 8
const BEATS_PER_BAR = 4
const MIN_DURATION_BEATS = 0.25
const KEY_COLUMN_WIDTH = 64
const ROLL_HEADER_HEIGHT = 32
const ROLL_ROW_HEIGHT = 32
const DEFAULT_BEAT_WIDTH = 80
const AUTO_SAVE_DELAY_MS = 500
const ACTIVE_EDIT_AUTO_SAVE_DELAY_MS = 1200
const FLOAT_EPSILON = 0.0001
const PLAYBACK_SCHEDULER_MS = 80
const PLAYBACK_LOOKAHEAD_BEATS = 0.32
const TEMPO_PRESETS = [60, 72, 80, 90, 100, 110, 120, 128, 140, 160, 180, 200]
const TEMPO_GRAPH_MIN = 40
const TEMPO_GRAPH_MAX = 220
const PLAYHEAD_SCROLL_PADDING = 160
const NOTE_DIVISIONS = [8, 16, 32, 64, 128] as const
const ROLL_ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const
const DEFAULT_PROJECT_LENGTH_BEATS = DEFAULT_BARS * BEATS_PER_BAR
const EDITING_TAIL_BARS = 128
const EDITING_TAIL_BEATS = EDITING_TAIL_BARS * BEATS_PER_BAR
const HISTORY_LIMIT = 80
const PATTERN_REPEAT_GAP_BEATS = 0.25
const KEYBOARD_INPUT_MAP: Record<string, number> = {
  KeyZ: 48,
  KeyX: 50,
  KeyC: 52,
  KeyV: 53,
  KeyB: 55,
  KeyN: 57,
  KeyM: 59,
  Comma: 60,
  Period: 62,
  Slash: 64,
  KeyA: 60,
  KeyW: 61,
  KeyS: 62,
  KeyE: 63,
  KeyD: 64,
  KeyF: 65,
  KeyT: 66,
  KeyG: 67,
  KeyY: 68,
  KeyH: 69,
  KeyU: 70,
  KeyJ: 71,
  KeyK: 72,
  KeyO: 73,
  KeyL: 74,
  KeyP: 75,
  Semicolon: 76,
  Quote: 77,
  Digit1: 72,
  Digit2: 74,
  Digit3: 76,
  Digit4: 77,
  Digit5: 79,
  Digit6: 81,
  Digit7: 83,
  Digit8: 84,
  Digit9: 86,
  Digit0: 88,
}
const KEYBOARD_INPUT_CODES = Object.keys(KEYBOARD_INPUT_MAP)
const DRUM_KEYBOARD_PITCHES = [
  36, 38, 42, 46, 41, 43, 45, 47, 48, 50,
  49, 51, 37, 39, 40, 44, 55, 57, 59, 35,
  52, 53, 54, 56, 60, 61, 62, 63, 64, 65,
  66, 67, 68, 69, 70, 71, 72, 75, 76, 81,
]

const BASE_LOW_PITCH = 48
const BASE_HIGH_PITCH = 84
const PITCH_RANGE_MARGIN = 4
const PITCHES = Array.from({ length: BASE_HIGH_PITCH - BASE_LOW_PITCH + 1 }, (_, index) => BASE_HIGH_PITCH - index)
const DRUM_PITCHES = Array.from({ length: 62 }, (_, index) => 87 - index)
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const DRUM_LABELS: Record<number, string> = {
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
const DRUM_INSTRUMENTS = [
  { family: 'Drums', icon: '◉', id: 'drums', label: 'Power Drum Kit', program: -1 },
  { family: 'Drums', icon: '○', id: 'standard-drums', label: 'Standard Drum Kit', program: -1 },
]
const INSTRUMENT_OPTIONS = [...DRUM_INSTRUMENTS, ...GENERAL_MIDI_INSTRUMENTS]
const INSTRUMENT_CATEGORY_ORDER = [
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
const INSTRUMENT_CATEGORY_LABELS: Record<string, string> = {
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
const INSTRUMENT_CATEGORY_IMAGES: Record<string, InstrumentId> = {
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
const TRACK_COLORS = ['#5365d9', '#21a67a', '#d69b32', '#c95c8c', '#6a78f0', '#9b6bd3']
const TERMINOLOGY_HELP = [
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

type PlaybackInstrument = ReturnType<typeof createInstrument>
type EditorTab = 'piano-roll' | 'arrange' | 'tempo' | 'automix'
type ToolMode = 'draw' | 'erase' | 'select' | 'lasso'
type NoteDivision = (typeof NOTE_DIVISIONS)[number]
type RollZoom = (typeof ROLL_ZOOM_LEVELS)[number]

type NoteDrag = {
  active: boolean
  grabPitchOffset: number
  grabStepOffset: number
  groupNoteIds: string[]
  noteId: string
  originalNotes: Note[]
  originPitch: number
  originStep: number
  trackId: string
  lastPitch: number | null
  lastStep: number | null
}

type PatternSelection = {
  active: boolean
  startRow: number
  startStep: number
  endRow: number
  endStep: number
}

type SelectionBox = {
  height: number
  left: number
  selecting: boolean
  top: number
  width: number
}

type LassoPoint = {
  gridX: number
  gridY: number
  viewX: number
  viewY: number
}

type PatternRepeatDrag = {
  active: boolean
  baseEndBeat: number
  baseStartBeat: number
  baseWidth: number
  currentWidth: number
  gapBeats: number
  notes: Note[]
  repeatCount: number
  startClientX: number
  trackId: string
}

type KeyboardRecordingNote = {
  liveNoteInput: number | null
  noteId: string
  pitch: number
  startBeat: number
  trackId: string
}

type TrackContextMenu = {
  trackId: string
  x: number
  y: number
} | null

type PianoRollContextMenu = {
  x: number
  y: number
} | null

type RightClickRollAction = {
  active: boolean
  deleted: boolean
  menuX: number
  menuY: number
  moved: boolean
  startX: number
  startY: number
}

type PatternClipboard = {
  notes: Note[]
  sourceTrackId: string
  nextPasteBeat: number
}

type RollPointerGeometry = {
  gridWidth: number
  rect: DOMRect
  totalSteps: number
}

type PendingPointerMove = {
  buttons: number
  clientX: number
  clientY: number
}

type ActivePlaybackTrack = {
  activeFrequencies: Map<number, number>
  id: string
  instrument: PlaybackInstrument
  isDrum: boolean
  notes: Note[]
  nextIndex: number
}

type OtherNote = Note & { trackId: string }

type AutoMixReportItem = {
  afterPan: number
  afterVolume: number
  beforeVolume: number
  noteChanges: number
  role: string
  trackId: string
}

type OtherNotesByPitchCache = {
  noteArrays: Note[][]
  selectedTrackId: string | undefined
  trackIds: string[]
  value: Map<number, OtherNote[]>
}

type InteractionHandlers = {
  copySelectedNotes: () => void
  cutSelectedNotes: () => void
  deleteSelectedNote: () => void
  eraseDraggedCellFromPointer: (clientX: number, clientY: number) => void
  eraseRightDraggedCellFromPointer: (clientX: number, clientY: number) => void
  finishPatternSelection: () => void
  finishPatternRepeat: () => void
  finishKeyboardNote: (code: string, eventTimeStamp?: number) => void
  startKeyboardNote: (code: string, eventTimeStamp?: number) => void
  updatePatternRepeatPreview: (clientX: number) => void
  updateLassoSelectionFromPointer: (clientX: number, clientY: number) => void
  zoomRoll: (direction: -1 | 1) => void
  moveDraggedNoteFromPointer: (clientX: number, clientY: number) => void
  pasteSelectedNotes: () => void
  redoProject: () => void
  selectAllNotes: () => void
  undoProject: () => void
  updatePatternSelectionFromPointer: (clientX: number, clientY: number) => void
  stopHeldPreview: () => void
  togglePlayback: () => void
}

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

function getPitchName(pitch: number) {
  const octave = Math.floor(pitch / 12) - 1
  return `${NOTE_NAMES[pitch % 12]}${octave}`
}

function createInitialProject(): Project {
  const firstTrackId = createId('track')

  return {
    version: 1,
    id: createId('project'),
    title: '나의 첫 멜로디',
    tempo: 120,
    timeSignature: [4, 4],
    selectedTrackId: firstTrackId,
    selectedNoteId: null,
    lengthBeats: DEFAULT_PROJECT_LENGTH_BEATS,
    theme: 'dark',
    tracks: [
      {
        id: firstTrackId,
        name: '트랙 1',
        instrumentId: 'gm-0',
        volume: 0.85,
        pan: 0,
        mute: false,
        channel: 1,
        color: TRACK_COLORS[0],
      },
    ],
    notesByTrack: {
      [firstTrackId]: [],
    },
    audioClips: [],
    autoMixSections: [],
  }
}

function normalizeProject(project: Project): Project {
  const fallbackTrackId = createId('track')
  const tracks: Track[] = project.tracks?.length
      ? project.tracks.map((track, index) => ({
        ...track,
        name: track.name?.startsWith('Track ') ? `트랙 ${index + 1}` : track.name,
        kind: track.kind ?? (track.instrumentId === 'audio-track' ? 'audio' as const : 'instrument' as const),
        pan: track.pan ?? 0,
        mute: track.mute ?? false,
        channel: track.channel ?? (isDrumInstrument(track.instrumentId) ? 10 : Math.min(16, index + 1)),
        color: track.color ?? TRACK_COLORS[index % TRACK_COLORS.length],
      }))
    : [
        {
          id: fallbackTrackId,
          name: '트랙 1',
          instrumentId: 'gm-0',
          kind: 'instrument',
          volume: 0.85,
          pan: 0,
          mute: false,
          channel: 1,
          color: TRACK_COLORS[0],
        },
      ]
  const selectedTrackId = tracks.some((track) => track.id === project.selectedTrackId)
    ? project.selectedTrackId
    : tracks[0].id

  return {
    ...project,
    version: 1,
    title: project.title || '나의 첫 멜로디',
    tempo: project.tempo || 120,
    timeSignature: project.timeSignature ?? [4, 4],
    selectedTrackId,
    selectedNoteId: project.selectedNoteId ?? null,
    lengthBeats: Math.max(DEFAULT_PROJECT_LENGTH_BEATS, project.lengthBeats ?? DEFAULT_PROJECT_LENGTH_BEATS),
    theme: 'dark',
    tracks,
    notesByTrack: {
      ...Object.fromEntries(tracks.map((track) => [track.id, []])),
      ...(project.notesByTrack ?? {}),
    },
    audioClips: (project.audioClips ?? []).filter((clip) =>
      tracks.some((track) => track.id === clip.trackId) && clip.dataUrl,
    ).map((clip) => ({
      ...clip,
      waveform: clip.waveform ?? [],
    })),
    autoMixSections: (project.autoMixSections ?? []).map((section) => ({
      ...section,
      intensity: Math.min(1, Math.max(0, section.intensity ?? 0.7)),
      priorities: section.priorities ?? {},
      startBeat: Math.max(0, section.startBeat ?? 0),
      endBeat: Math.max(section.startBeat ?? 0, section.endBeat ?? DEFAULT_PROJECT_LENGTH_BEATS),
    })),
  }
}

function readSavedProject() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? normalizeProject(JSON.parse(saved) as Project) : createInitialProject()
  } catch {
    return createInitialProject()
  }
}

const trackEndBeatCache = new WeakMap<Note[], number>()

function getTrackEndBeat(notes: Note[]) {
  const cached = trackEndBeatCache.get(notes)
  if (cached !== undefined) return cached

  const endBeat = notes.reduce(
    (latestEnd, note) => Math.max(latestEnd, note.startBeat + note.durationBeats),
    0,
  )
  trackEndBeatCache.set(notes, endBeat)
  return endBeat
}

function getNotesEndBeat(notesByTrack: Project['notesByTrack']) {
  return Object.values(notesByTrack)
    .reduce((endBeat, notes) => Math.max(endBeat, getTrackEndBeat(notes)), 0)
}

function nearlyEqual(left: number, right: number) {
  return Math.abs(left - right) < FLOAT_EPSILON
}

function getVisibleBars(endBeat: number) {
  const neededBars = Math.max(DEFAULT_BARS, Math.ceil(endBeat / BEATS_PER_BAR))
  let visibleBars = DEFAULT_BARS

  while (visibleBars < neededBars) {
    visibleBars *= 2
  }

  return visibleBars
}

function getInstrumentCategory(instrumentId: InstrumentId) {
  return INSTRUMENT_OPTIONS.find((instrument) => instrument.id === instrumentId)?.family ?? 'Piano'
}

function getCategoryLabel(category: string) {
  return INSTRUMENT_CATEGORY_LABELS[category] ?? category
}

function getNextZoom(currentZoom: RollZoom, direction: -1 | 1) {
  const currentIndex = ROLL_ZOOM_LEVELS.indexOf(currentZoom)
  const nextIndex = Math.min(
    ROLL_ZOOM_LEVELS.length - 1,
    Math.max(0, currentIndex + direction),
  )

  return ROLL_ZOOM_LEVELS[nextIndex]
}

function getDynamicPitches(notes: Note[]) {
  if (notes.length === 0) return PITCHES

  const minPitch = Math.max(0, Math.min(BASE_LOW_PITCH, Math.min(...notes.map((note) => note.pitch)) - PITCH_RANGE_MARGIN))
  const maxPitch = Math.min(127, Math.max(BASE_HIGH_PITCH, Math.max(...notes.map((note) => note.pitch)) + PITCH_RANGE_MARGIN))
  return Array.from({ length: maxPitch - minPitch + 1 }, (_, index) => maxPitch - index)
}

function App() {
  const [project, setProjectState] = useState<Project>(() => readSavedProject())
  const [tempoInput, setTempoInput] = useState(() => String(project.tempo))
  const [resizingNoteId, setResizingNoteId] = useState<string | null>(null)
  const [instrumentMenuTrackId, setInstrumentMenuTrackId] = useState<string | null>(null)
  const [fileMenuOpen, setFileMenuOpen] = useState(false)
  const [editMenuOpen, setEditMenuOpen] = useState(false)
  const [isExportingMp3, setIsExportingMp3] = useState(false)
  const [isAutoMixing, setIsAutoMixing] = useState(false)
  const [autoMixReport, setAutoMixReport] = useState<AutoMixReportItem[]>([])
  const [isRecordingVoice, setIsRecordingVoice] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackBeat, setPlaybackBeat] = useState(0)
  const [autoMixPanelOpen, setAutoMixPanelOpen] = useState(false)
  const [activeEditorTab, setActiveEditorTab] = useState<EditorTab>('piano-roll')
  const [toolMode, setToolMode] = useState<ToolMode>('draw')
  const [pressedPitch, setPressedPitch] = useState<number | null>(null)
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [instrumentCategory, setInstrumentCategory] = useState('Piano')
  const [pendingInstrumentId, setPendingInstrumentId] = useState<InstrumentId | null>(null)
  const [trackContextMenu, setTrackContextMenu] = useState<TrackContextMenu>(null)
  const [pianoRollContextMenu, setPianoRollContextMenu] = useState<PianoRollContextMenu>(null)
  const [noteDivision, setNoteDivision] = useState<NoteDivision>(8)
  const [rollZoom, setRollZoom] = useState<RollZoom>(1)
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([])
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null)
  const [lassoPoints, setLassoPoints] = useState<LassoPoint[]>([])
  const [keyboardInputEnabled, setKeyboardInputEnabled] = useState(false)
  const [activeDetailTerm, setActiveDetailTerm] = useState(TERMINOLOGY_HELP[0].term)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioFileInputRef = useRef<HTMLInputElement>(null)
  const pianoRollRef = useRef<HTMLDivElement>(null)
  const projectRef = useRef(project)
  const undoStackRef = useRef<Project[]>([])
  const redoStackRef = useRef<Project[]>([])
  const savedProjectJsonRef = useRef('')
  const activeInstrumentsRef = useRef<PlaybackInstrument[]>([])
  const activePlaybackTracksRef = useRef<ActivePlaybackTrack[]>([])
  const activeTimeoutsRef = useRef<number[]>([])
  const activeIntervalsRef = useRef<number[]>([])
  const activeAudioElementsRef = useRef<HTMLAudioElement[]>([])
  const activeAudioNodesRef = useRef<Array<{ gain: GainNode; panner: StereoPannerNode; source: AudioBufferSourceNode }>>([])
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordingChunksRef = useRef<Blob[]>([])
  const recordingStartBeatRef = useRef(0)
  const recordingStartMsRef = useRef(0)
  const playbackSessionRef = useRef(0)
  const playbackStartMsRef = useRef(0)
  const playbackStartBeatRef = useRef(0)
  const playbackBeatRef = useRef(0)
  const totalBeatsRef = useRef(0)
  const heldPreviewRef = useRef<HeldPreview | null>(null)
  const previewTokenRef = useRef(0)
  const lastNoteDurationRef = useRef(MIN_DURATION_BEATS * 2)
  const noteDragRef = useRef<NoteDrag | null>(null)
  const patternClipboardRef = useRef<PatternClipboard | null>(null)
  const patternRepeatRef = useRef<PatternRepeatDrag | null>(null)
  const patternSelectionRef = useRef<PatternSelection | null>(null)
  const lassoSelectionRef = useRef<{ active: boolean; points: LassoPoint[] }>({ active: false, points: [] })
  const keyboardRecordingRef = useRef(new Map<string, KeyboardRecordingNote>())
  const eraseRef = useRef({ active: false, lastKey: '' })
  const rightEraseRef = useRef({ active: false, lastKey: '' })
  const rightClickRollActionRef = useRef<RightClickRollAction | null>(null)
  const erasedNoteIdsRef = useRef(new Set<string>())
  const keyPreviewRef = useRef({ active: false })
  const rollPointerGeometryRef = useRef<RollPointerGeometry | null>(null)
  const pendingPointerMoveRef = useRef<PendingPointerMove | null>(null)
  const pointerMoveFrameRef = useRef(0)
  const otherNotesByPitchCacheRef = useRef<OtherNotesByPitchCache | null>(null)
  const interactionHandlersRef = useRef<InteractionHandlers>({
    copySelectedNotes: () => {},
    cutSelectedNotes: () => {},
    deleteSelectedNote: () => {},
    eraseDraggedCellFromPointer: () => {},
    eraseRightDraggedCellFromPointer: () => {},
    finishPatternSelection: () => {},
    finishPatternRepeat: () => {},
    finishKeyboardNote: () => {},
    startKeyboardNote: () => {},
    updatePatternRepeatPreview: () => {},
    updateLassoSelectionFromPointer: () => {},
    zoomRoll: () => {},
    moveDraggedNoteFromPointer: () => {},
    pasteSelectedNotes: () => {},
    redoProject: () => {},
    selectAllNotes: () => {},
    updatePatternSelectionFromPointer: () => {},
    undoProject: () => {},
    stopHeldPreview: () => {},
    togglePlayback: () => {},
  })

  const selectedTrack = useMemo(
    () => project.tracks.find((track) => track.id === project.selectedTrackId) ?? project.tracks[0],
    [project.selectedTrackId, project.tracks],
  )
  const selectedTrackNotes = useMemo(
    () => (selectedTrack ? project.notesByTrack[selectedTrack.id] ?? [] : []),
    [project.notesByTrack, selectedTrack],
  )
  const selectedAudioClips = useMemo(
    () => (selectedTrack ? (project.audioClips ?? []).filter((clip) => clip.trackId === selectedTrack.id) : []),
    [project.audioClips, selectedTrack],
  )
  const selectedAudioClip = selectedAudioClips[0] ?? null
  const selectedTrackIsAudio = selectedTrack?.kind === 'audio' || selectedTrack?.instrumentId === 'audio-track'
  const selectedNote = useMemo(
    () => selectedTrackNotes.find((note) => note.id === project.selectedNoteId) ?? null,
    [project.selectedNoteId, selectedTrackNotes],
  )
  const selectedNoteIdSet = useMemo(() => new Set(selectedNoteIds), [selectedNoteIds])
  const selectedPatternNotes = useMemo(
    () => selectedTrackNotes.filter((note) => selectedNoteIdSet.has(note.id)),
    [selectedNoteIdSet, selectedTrackNotes],
  )
  const editableSelectedNotes = useMemo(
    () => (
      selectedPatternNotes.length > 0
        ? selectedPatternNotes
        : selectedNote
          ? [selectedNote]
          : []
    ),
    [selectedNote, selectedPatternNotes],
  )
  const sortedEditableSelectedNotes = useMemo(
    () => [...editableSelectedNotes].sort((left, right) => (
      left.startBeat - right.startBeat || right.pitch - left.pitch
    )),
    [editableSelectedNotes],
  )
  const projectEndBeat = useMemo(() => getNotesEndBeat(project.notesByTrack), [project.notesByTrack])
  const projectLengthBeats = Math.max(DEFAULT_PROJECT_LENGTH_BEATS, projectEndBeat + EDITING_TAIL_BEATS)
  const visibleBars = getVisibleBars(projectLengthBeats)
  const totalBeats = visibleBars * BEATS_PER_BAR
  const stepsPerBeat = noteDivision / 4
  const defaultDurationBeats = Math.max(MIN_DURATION_BEATS, Math.round(lastNoteDurationRef.current * stepsPerBeat) / stepsPerBeat)
  const totalSteps = totalBeats * stepsPerBeat
  const rollPitches = useMemo(
    () => (selectedTrack?.instrumentId && isDrumInstrument(selectedTrack.instrumentId) ? DRUM_PITCHES : getDynamicPitches(selectedTrackNotes)),
    [selectedTrack?.instrumentId, selectedTrackNotes],
  )
  const tempoGraphPercent = Math.min(
    100,
    Math.max(0, ((project.tempo - TEMPO_GRAPH_MIN) / (TEMPO_GRAPH_MAX - TEMPO_GRAPH_MIN)) * 100),
  )
  const beatWidth = DEFAULT_BEAT_WIDTH * rollZoom
  const stepWidth = beatWidth / stepsPerBeat
  const rollTimelineStyle = { gridTemplateColumns: `repeat(${visibleBars}, minmax(64px, 1fr))` }
  const rollSurfaceStyle = {
    '--bar-width': `${beatWidth * BEATS_PER_BAR}px`,
    '--beat-width': `${beatWidth}px`,
    '--roll-grid-height': `${rollPitches.length * ROLL_ROW_HEIGHT}px`,
    '--roll-grid-width': `${totalBeats * beatWidth}px`,
    '--step-width': `${stepWidth}px`,
    '--total-steps': totalSteps,
    '--visible-bars': visibleBars,
  } as CSSProperties
  const rollShellStyle = {
    ...rollSurfaceStyle,
    gridTemplateColumns: `64px minmax(${totalBeats * beatWidth}px, 1fr)`,
  } as CSSProperties
  const selectedNotesByPitch = useMemo(() => {
    const notesByPitch = new Map<number, Note[]>()
    selectedTrackNotes.forEach((note) => {
      const pitchNotes = notesByPitch.get(note.pitch) ?? []
      pitchNotes.push(note)
      notesByPitch.set(note.pitch, pitchNotes)
    })
    return notesByPitch
  }, [selectedTrackNotes])
  const otherNotesByPitch = useMemo(() => {
    const trackIds: string[] = []
    const noteArrays: Note[][] = []
    project.tracks.forEach((track) => {
      if (track.id === selectedTrack?.id) return
      trackIds.push(track.id)
      noteArrays.push(project.notesByTrack[track.id] ?? [])
    })

    const cached = otherNotesByPitchCacheRef.current
    const cacheMatches =
      cached?.selectedTrackId === selectedTrack?.id &&
      cached.trackIds.length === trackIds.length &&
      cached.trackIds.every((trackId, index) => (
        trackId === trackIds[index] && cached.noteArrays[index] === noteArrays[index]
      ))

    if (cacheMatches) return cached.value

    const notesByPitch = new Map<number, OtherNote[]>()
    trackIds.forEach((trackId, trackIndex) => {
      noteArrays[trackIndex].forEach((note) => {
        const pitchNotes = notesByPitch.get(note.pitch) ?? []
        pitchNotes.push({ ...note, trackId })
        notesByPitch.set(note.pitch, pitchNotes)
      })
    })

    otherNotesByPitchCacheRef.current = {
      noteArrays,
      selectedTrackId: selectedTrack?.id,
      trackIds,
      value: notesByPitch,
    }
    return notesByPitch
  }, [project.notesByTrack, project.tracks, selectedTrack?.id])
  const instrumentDialogTrack =
    project.tracks.find((track) => track.id === instrumentMenuTrackId) ?? null
  const selectedInstrumentId =
    pendingInstrumentId ?? instrumentDialogTrack?.instrumentId ?? selectedTrack?.instrumentId ?? 'gm-0'
  const instrumentCategories = useMemo(
    () =>
      INSTRUMENT_CATEGORY_ORDER.filter((category) =>
        INSTRUMENT_OPTIONS.some((instrument) => instrument.family === category),
      ),
    [],
  )
  const categoryInstruments = useMemo(
    () => INSTRUMENT_OPTIONS.filter((instrument) => instrument.family === instrumentCategory),
    [instrumentCategory],
  )

  function setProject(update: SetStateAction<Project>) {
    setProjectState((current) => {
      const nextProject = typeof update === 'function'
        ? (update as (currentProject: Project) => Project)(current)
        : update

      if (nextProject === current) return current

      undoStackRef.current = [...undoStackRef.current.slice(-(HISTORY_LIMIT - 1)), current]
      redoStackRef.current = []
      projectRef.current = nextProject
      return nextProject
    })
  }

  function restoreProject(nextProject: Project) {
    projectRef.current = nextProject
    setProjectState(nextProject)
    setSelectedNoteIds([])
    setSelectionBox(null)
    patternSelectionRef.current = null
  }

  function undoProject() {
    const previousProject = undoStackRef.current.at(-1)
    if (!previousProject) return

    undoStackRef.current = undoStackRef.current.slice(0, -1)
    redoStackRef.current = [...redoStackRef.current.slice(-(HISTORY_LIMIT - 1)), projectRef.current]
    restoreProject(previousProject)
  }

  function redoProject() {
    const nextProject = redoStackRef.current.at(-1)
    if (!nextProject) return

    redoStackRef.current = redoStackRef.current.slice(0, -1)
    undoStackRef.current = [...undoStackRef.current.slice(-(HISTORY_LIMIT - 1)), projectRef.current]
    restoreProject(nextProject)
  }

  useEffect(() => {
    function closeMenusFromOutsidePointer(event: PointerEvent) {
      if (event.button === 2) return
      const target = event.target
      if (target instanceof Element && target.closest('.track-context-menu')) return

      setTrackContextMenu(null)
      setPianoRollContextMenu(null)
    }

    window.addEventListener('pointerdown', closeMenusFromOutsidePointer, { capture: true })
    return () => window.removeEventListener('pointerdown', closeMenusFromOutsidePointer, { capture: true })
  }, [])

  useEffect(() => {
    const roll = pianoRollRef.current
    if (!roll) return undefined

    function handleNativeWheel(event: WheelEvent) {
      if (!event.ctrlKey) return

      event.preventDefault()
      interactionHandlersRef.current.zoomRoll(event.deltaY > 0 ? -1 : 1)
    }

    roll.addEventListener('wheel', handleNativeWheel, { passive: false })
    return () => roll.removeEventListener('wheel', handleNativeWheel)
  }, [])

  useEffect(() => {
    projectRef.current = project
    const isEditing =
      Boolean(resizingNoteId) ||
      Boolean(noteDragRef.current?.active) ||
      eraseRef.current.active ||
      rightEraseRef.current.active
    const saveDelay = isEditing ? ACTIVE_EDIT_AUTO_SAVE_DELAY_MS : AUTO_SAVE_DELAY_MS
    const saveTimeout = window.setTimeout(() => {
      const nextProjectJson = JSON.stringify(projectRef.current)
      if (nextProjectJson !== savedProjectJsonRef.current) {
        localStorage.setItem(STORAGE_KEY, nextProjectJson)
        savedProjectJsonRef.current = nextProjectJson
      }
    }, saveDelay)

    return () => window.clearTimeout(saveTimeout)
  }, [project, resizingNoteId])

  useEffect(() => {
    playbackBeatRef.current = playbackBeat
    totalBeatsRef.current = totalBeats
    pianoRollRef.current?.style.setProperty(
      '--playhead-left',
      `${Math.min(100, (playbackBeat / totalBeats) * 100)}%`,
    )
  }, [playbackBeat, totalBeats])

  useEffect(() => {
    setTempoInput(String(project.tempo))
  }, [project.tempo])

  useEffect(() => {
    setSelectedNoteIds([])
    setSelectionBox(null)
    patternSelectionRef.current = null
    lassoSelectionRef.current = { active: false, points: [] }
    setLassoPoints([])
  }, [selectedTrack?.id])

  useEffect(() => {
    if (activeEditorTab !== 'piano-roll') return
    if (selectedNoteIds.length === 0) {
      if (!patternSelectionRef.current?.active && !patternRepeatRef.current?.active) {
        setSelectionBox(null)
      }
      return
    }
    if (patternSelectionRef.current?.active || patternRepeatRef.current?.active || noteDragRef.current?.active) return

    const selectedNoteIdSetForBox = new Set(selectedNoteIds)
    const selectedNotes = selectedTrackNotes.filter((note) => selectedNoteIdSetForBox.has(note.id))
    if (selectedNotes.length === 0) {
      setSelectionBox(null)
      return
    }

    const rows = selectedNotes
      .map((note) => rollPitches.indexOf(note.pitch))
      .filter((rowIndex) => rowIndex >= 0)
    if (rows.length === 0) {
      setSelectionBox(null)
      return
    }

    const roll = pianoRollRef.current
    const gridWidth = Math.max(totalSteps * stepWidth, (roll?.clientWidth ?? 0) - KEY_COLUMN_WIDTH)
    const cellWidth = gridWidth / totalSteps
    const startStep = Math.min(...selectedNotes.map((note) => Math.round(note.startBeat * stepsPerBeat)))
    const endStep = Math.max(...selectedNotes.map((note) => Math.ceil((note.startBeat + note.durationBeats) * stepsPerBeat) - 1))
    const startRow = Math.min(...rows)
    const endRow = Math.max(...rows)

    setSelectionBox({
      height: (endRow - startRow + 1) * ROLL_ROW_HEIGHT,
      left: KEY_COLUMN_WIDTH + startStep * cellWidth,
      selecting: false,
      top: ROLL_HEADER_HEIGHT + startRow * ROLL_ROW_HEIGHT,
      width: (endStep - startStep + 1) * cellWidth,
    })
  }, [activeEditorTab, rollPitches, selectedNoteIds, selectedTrackNotes, stepWidth, stepsPerBeat, totalSteps])

  interactionHandlersRef.current.togglePlayback = togglePlayback
  interactionHandlersRef.current.copySelectedNotes = copySelectedNotes
  interactionHandlersRef.current.cutSelectedNotes = cutSelectedNotes
  interactionHandlersRef.current.deleteSelectedNote = deleteSelectedNote
  interactionHandlersRef.current.moveDraggedNoteFromPointer = moveDraggedNoteFromPointer
  interactionHandlersRef.current.eraseDraggedCellFromPointer = eraseDraggedCellFromPointer
  interactionHandlersRef.current.eraseRightDraggedCellFromPointer = eraseRightDraggedCellFromPointer
  interactionHandlersRef.current.finishPatternSelection = finishPatternSelection
  interactionHandlersRef.current.finishPatternRepeat = finishPatternRepeat
  interactionHandlersRef.current.finishKeyboardNote = finishKeyboardNote
  interactionHandlersRef.current.startKeyboardNote = startKeyboardNote
  interactionHandlersRef.current.updatePatternRepeatPreview = updatePatternRepeatPreview
  interactionHandlersRef.current.updateLassoSelectionFromPointer = updateLassoSelectionFromPointer
  interactionHandlersRef.current.zoomRoll = zoomRoll
  interactionHandlersRef.current.pasteSelectedNotes = pasteSelectedNotes
  interactionHandlersRef.current.redoProject = redoProject
  interactionHandlersRef.current.selectAllNotes = selectAllNotes
  interactionHandlersRef.current.undoProject = undoProject
  interactionHandlersRef.current.updatePatternSelectionFromPointer = updatePatternSelectionFromPointer
  interactionHandlersRef.current.stopHeldPreview = stopHeldPreview

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey) {
        if (event.code === 'KeyZ') {
          event.preventDefault()
          if (event.shiftKey) {
            interactionHandlersRef.current.redoProject()
          } else {
            interactionHandlersRef.current.undoProject()
          }
          return
        }

        if (event.code === 'KeyY') {
          event.preventDefault()
          interactionHandlersRef.current.redoProject()
          return
        }

        if (event.code === 'KeyC') {
          event.preventDefault()
          interactionHandlersRef.current.copySelectedNotes()
          return
        }

        if (event.code === 'KeyA') {
          event.preventDefault()
          interactionHandlersRef.current.selectAllNotes()
          return
        }

        if (event.code === 'KeyX') {
          event.preventDefault()
          interactionHandlersRef.current.cutSelectedNotes()
          return
        }

        if (event.code === 'KeyV') {
          event.preventDefault()
          interactionHandlersRef.current.pasteSelectedNotes()
          return
        }

        if (event.code === 'Equal' || event.code === 'NumpadAdd') {
          event.preventDefault()
          interactionHandlersRef.current.zoomRoll(1)
          return
        }

        if (event.code === 'Minus' || event.code === 'NumpadSubtract') {
          event.preventDefault()
          interactionHandlersRef.current.zoomRoll(-1)
          return
        }

      }

      const target = event.target
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)

      if (event.code === 'Escape') {
        closeTrackContextMenu()
        closePianoRollContextMenu()
        return
      }

      if (!event.repeat && !isTypingTarget) {
        interactionHandlersRef.current.startKeyboardNote(event.code, event.timeStamp)
      }

      if (event.code === 'Delete' || event.code === 'Backspace') {
        if (isTypingTarget) {
          return
        }

        event.preventDefault()
        interactionHandlersRef.current.deleteSelectedNote()
        return
      }

      if (event.code !== 'Space') return
      event.preventDefault()
      interactionHandlersRef.current.togglePlayback()
    }

    function handleKeyUp(event: KeyboardEvent) {
      interactionHandlersRef.current.finishKeyboardNote(event.code, event.timeStamp)
    }

    function flushPointerMove() {
      pointerMoveFrameRef.current = 0
      const pendingMove = pendingPointerMoveRef.current
      pendingPointerMoveRef.current = null
      if (!pendingMove) return

      const rightClickAction = rightClickRollActionRef.current
      if (rightClickAction?.active && (pendingMove.buttons & 2) === 2) {
        const movedDistance = Math.hypot(
          pendingMove.clientX - rightClickAction.startX,
          pendingMove.clientY - rightClickAction.startY,
        )
        if (movedDistance > 4) {
          rightClickAction.moved = true
        }
      }

      interactionHandlersRef.current.moveDraggedNoteFromPointer(pendingMove.clientX, pendingMove.clientY)
      interactionHandlersRef.current.updatePatternRepeatPreview(pendingMove.clientX)
      interactionHandlersRef.current.eraseDraggedCellFromPointer(pendingMove.clientX, pendingMove.clientY)
      interactionHandlersRef.current.updatePatternSelectionFromPointer(pendingMove.clientX, pendingMove.clientY)
      interactionHandlersRef.current.updateLassoSelectionFromPointer(pendingMove.clientX, pendingMove.clientY)
      if (rightEraseRef.current.active && (pendingMove.buttons & 2) !== 2) {
        rightEraseRef.current = { active: false, lastKey: '' }
        erasedNoteIdsRef.current = new Set()
        return
      }
      interactionHandlersRef.current.eraseRightDraggedCellFromPointer(pendingMove.clientX, pendingMove.clientY)
    }

    function handlePointerMove(event: PointerEvent) {
      const hasActivePointerTask =
        Boolean(noteDragRef.current?.active) ||
        Boolean(patternSelectionRef.current?.active) ||
        Boolean(patternRepeatRef.current?.active) ||
        lassoSelectionRef.current.active ||
        eraseRef.current.active ||
        rightEraseRef.current.active

      if (!hasActivePointerTask) return

      pendingPointerMoveRef.current = {
        buttons: event.buttons,
        clientX: event.clientX,
        clientY: event.clientY,
      }

      if (pointerMoveFrameRef.current === 0) {
        pointerMoveFrameRef.current = window.requestAnimationFrame(flushPointerMove)
      }
    }

    function clearPointerState(event?: PointerEvent) {
      if (pointerMoveFrameRef.current !== 0) {
        window.cancelAnimationFrame(pointerMoveFrameRef.current)
        flushPointerMove()
      }
      const rightClickAction = rightClickRollActionRef.current
      pendingPointerMoveRef.current = null
      interactionHandlersRef.current.finishPatternSelection()
      interactionHandlersRef.current.finishPatternRepeat()
      noteDragRef.current = null
      patternSelectionRef.current = null
      lassoSelectionRef.current = { active: false, points: [] }
      setLassoPoints([])
      eraseRef.current = { active: false, lastKey: '' }
      rightEraseRef.current = { active: false, lastKey: '' }
      rightClickRollActionRef.current = null
      erasedNoteIdsRef.current = new Set()
      keyPreviewRef.current.active = false
      rollPointerGeometryRef.current = null
      setDraggingNoteId(null)
      interactionHandlersRef.current.stopHeldPreview()

      if (
        event?.type === 'pointerup' &&
        event.button === 2 &&
        rightClickAction?.active &&
        !rightClickAction.moved &&
        !rightClickAction.deleted
      ) {
        setPianoRollContextMenu({
          x: rightClickAction.menuX,
          y: rightClickAction.menuY,
        })
      }
    }

    function suppressNativeContextMenu(event: MouseEvent) {
      if (rightClickRollActionRef.current || pianoRollRef.current?.contains(event.target as Node)) {
        event.preventDefault()
      }
    }

    function clearPointerStateOnBlur() {
      clearPointerState()
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', clearPointerState)
    window.addEventListener('pointercancel', clearPointerState)
    window.addEventListener('contextmenu', suppressNativeContextMenu)
    window.addEventListener('blur', clearPointerStateOnBlur)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', clearPointerState)
      window.removeEventListener('pointercancel', clearPointerState)
      window.removeEventListener('contextmenu', suppressNativeContextMenu)
      window.removeEventListener('blur', clearPointerStateOnBlur)
      if (pointerMoveFrameRef.current !== 0) {
        window.cancelAnimationFrame(pointerMoveFrameRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!isPlaying) return

    let frameId = 0
    const tick = () => {
      const elapsedMs = performance.now() - playbackStartMsRef.current
      const elapsedBeat = elapsedMs / 1000 / (60 / projectRef.current.tempo)
      const currentBeat = Math.min(
        totalBeatsRef.current,
        playbackStartBeatRef.current + elapsedBeat,
      )
      playbackBeatRef.current = currentBeat
      pianoRollRef.current?.style.setProperty(
        '--playhead-left',
        `${Math.min(100, (currentBeat / totalBeatsRef.current) * 100)}%`,
      )
      const roll = pianoRollRef.current
      if (roll && totalBeatsRef.current > 0) {
        const gridWidth = Math.max(
          totalBeatsRef.current * DEFAULT_BEAT_WIDTH * rollZoom,
          roll.scrollWidth - KEY_COLUMN_WIDTH,
        )
        const playheadX = KEY_COLUMN_WIDTH + (currentBeat / totalBeatsRef.current) * gridWidth
        const viewportLeft = roll.scrollLeft
        const viewportRight = viewportLeft + roll.clientWidth

        if (playheadX > viewportRight - PLAYHEAD_SCROLL_PADDING) {
          roll.scrollLeft = Math.min(
            roll.scrollWidth - roll.clientWidth,
            playheadX - roll.clientWidth + PLAYHEAD_SCROLL_PADDING,
          )
        } else if (playheadX < viewportLeft + KEY_COLUMN_WIDTH + PLAYHEAD_SCROLL_PADDING) {
          roll.scrollLeft = Math.max(0, playheadX - KEY_COLUMN_WIDTH - PLAYHEAD_SCROLL_PADDING)
        }
      }
      frameId = window.requestAnimationFrame(tick)
    }

    frameId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frameId)
  }, [isPlaying, rollZoom])

  function updateProjectTitle(title: string) {
    setProject((current) => (current.title === title ? current : { ...current, title }))
  }

  function updateTempo(tempo: number) {
    if (!Number.isFinite(tempo) || tempo <= 0) return

    const nextTempo = tempo
    setProject((current) => (current.tempo === nextTempo ? current : { ...current, tempo: nextTempo }))
    setTempoInput(String(nextTempo))
  }

  function commitTempoInput() {
    const parsedTempo = Number(tempoInput)
    if (Number.isFinite(parsedTempo) && parsedTempo > 0) {
      updateTempo(parsedTempo)
      return
    }

    setTempoInput(String(project.tempo))
  }

  function changeTempoInput(value: string) {
    setTempoInput(value)
    const parsedTempo = Number(value)
    if (!Number.isFinite(parsedTempo) || parsedTempo <= 0 || value.trim() === '') return
    updateTempo(parsedTempo)
  }

  function addTrack() {
    setProject((current) => {
      const trackId = createId('track')
      const nextTrack: Track = {
        id: trackId,
        name: `트랙 ${current.tracks.length + 1}`,
        instrumentId: 'gm-0',
        kind: 'instrument',
        volume: 0.85,
        pan: 0,
        mute: false,
        channel: Math.min(16, current.tracks.length + 1),
        color: TRACK_COLORS[current.tracks.length % TRACK_COLORS.length],
      }

      return {
        ...current,
        selectedTrackId: trackId,
        selectedNoteId: null,
        tracks: [...current.tracks, nextTrack],
        notesByTrack: { ...current.notesByTrack, [trackId]: [] },
      }
    })
  }

  function updateTrack(trackId: string, updates: Partial<Track>) {
    setProject((current) => {
      let changed = false
      const tracks = current.tracks.map((track) => {
        if (track.id !== trackId) return track

        const nextTrack = { ...track, ...updates }
        if (
          nextTrack.instrumentId !== track.instrumentId ||
          nextTrack.volume !== track.volume ||
          nextTrack.pan !== track.pan ||
          nextTrack.mute !== track.mute ||
          nextTrack.channel !== track.channel ||
          nextTrack.name !== track.name ||
          nextTrack.color !== track.color
        ) {
          changed = true
          return nextTrack
        }

        return track
      })

      return changed ? { ...current, tracks } : current
    })
  }

  function selectTrack(trackId: string) {
    setProject((current) =>
      current.selectedTrackId === trackId && current.selectedNoteId === null
        ? current
        : { ...current, selectedTrackId: trackId, selectedNoteId: null },
    )
  }

  function deleteTrack(trackId: string) {
    setProject((current) => {
      if (current.tracks.length <= 1) return current

      const nextTracks = current.tracks.filter((track) => track.id !== trackId)
      const nextNotesByTrack = Object.fromEntries(
        Object.entries(current.notesByTrack).filter(([notesTrackId]) => notesTrackId !== trackId),
      )
      const selectedTrackId =
        current.selectedTrackId === trackId ? nextTracks[0].id : current.selectedTrackId

      return {
        ...current,
        selectedTrackId,
        selectedNoteId: null,
        tracks: nextTracks,
        notesByTrack: nextNotesByTrack,
      }
    })
  }

  function cycleTrackColor(trackId: string) {
    setProject((current) => ({
      ...current,
      tracks: current.tracks.map((track) => {
        if (track.id !== trackId) return track

        const currentIndex = TRACK_COLORS.indexOf(track.color ?? TRACK_COLORS[0])
        return {
          ...track,
          color: TRACK_COLORS[(currentIndex + 1) % TRACK_COLORS.length],
        }
      }),
    }))
  }

  function selectInstrument(trackId: string, instrumentId: InstrumentId) {
    updateTrack(trackId, { instrumentId })
    setInstrumentMenuTrackId(null)
    setPendingInstrumentId(null)
  }

  function openInstrumentDialog(track: Track) {
    selectTrack(track.id)
    setInstrumentMenuTrackId(track.id)
    setPendingInstrumentId(track.instrumentId)
    setInstrumentCategory(getInstrumentCategory(track.instrumentId))
  }

  function closeInstrumentDialog() {
    setInstrumentMenuTrackId(null)
    setPendingInstrumentId(null)
  }

  function closeTrackContextMenu() {
    setTrackContextMenu(null)
  }

  function closePianoRollContextMenu() {
    setPianoRollContextMenu(null)
  }

  function openTrackContextMenu(
    trackId: string,
    event: ReactPointerEvent<HTMLElement> | ReactMouseEvent<HTMLElement>,
  ) {
    event.preventDefault()
    event.stopPropagation()
    selectTrack(trackId)
    setTrackContextMenu({
      trackId,
      x: event.clientX,
      y: event.clientY,
    })
  }

  function openTrackPanelContextMenu(event: ReactMouseEvent<HTMLElement>) {
    if (event.currentTarget !== event.target) return

    event.preventDefault()
    event.stopPropagation()
    setPianoRollContextMenu(null)
    setTrackContextMenu({
      trackId: selectedTrack?.id ?? project.tracks[0].id,
      x: event.clientX,
      y: event.clientY,
    })
  }

  function beginRightClickRollAction(
    event: ReactPointerEvent<HTMLElement>,
    options: { deleteImmediately?: boolean; note?: Note } = {},
  ) {
    if (!selectedTrack || event.button !== 2) return

    event.preventDefault()
    event.stopPropagation()
    setTrackContextMenu(null)
    setPianoRollContextMenu(null)
    cacheRollPointerGeometry()
    rightEraseRef.current = { active: true, lastKey: '' }
    erasedNoteIdsRef.current = new Set(options.note ? [options.note.id] : [])
    rightClickRollActionRef.current = {
      active: true,
      deleted: Boolean(options.deleteImmediately),
      menuX: event.clientX,
      menuY: event.clientY,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
    }

    if (options.deleteImmediately && options.note) {
      deleteNote(options.note.id)
    }
  }

  function confirmInstrumentDialog() {
    if (!instrumentDialogTrack || !pendingInstrumentId) {
      closeInstrumentDialog()
      return
    }

    selectInstrument(instrumentDialogTrack.id, pendingInstrumentId)
  }

  function previewInstrumentChoice(instrumentId: InstrumentId) {
    setPendingInstrumentId(instrumentId)
    void previewNote(instrumentId, getInstrumentPreviewPitch(instrumentId), 0.78, 0.38)
  }

  function stopHeldPreview() {
    previewTokenRef.current += 1
    stopPreviewNote(heldPreviewRef.current)
    heldPreviewRef.current = null
    setPressedPitch(null)
  }

  function startHeldPreview(pitch: number, velocity = 0.75) {
    if (!selectedTrack) return

    stopHeldPreview()
    setPressedPitch(pitch)
    const token = previewTokenRef.current
    void startPreviewNote(selectedTrack.instrumentId, pitch, velocity).then((preview) => {
      if (token !== previewTokenRef.current) {
        stopPreviewNote(preview)
        return
      }
      heldPreviewRef.current = preview
    })
  }

  function changeHeldPreviewPitch(pitch: number, velocity = 0.75) {
    if (!heldPreviewRef.current) {
      startHeldPreview(pitch, velocity)
      return
    }

    if (heldPreviewRef.current.pitch !== pitch) {
      previewTokenRef.current += 1
      disposePreviewNote(heldPreviewRef.current)
      heldPreviewRef.current = null
      setPressedPitch(pitch)
      const token = previewTokenRef.current
      void startPreviewNote(selectedTrack?.instrumentId ?? 'gm-0', pitch, velocity).then((preview) => {
        if (token !== previewTokenRef.current) {
          disposePreviewNote(preview)
          return
        }
        heldPreviewRef.current = preview
      })
      return
    }

    setPressedPitch(pitch)
    changePreviewNote(heldPreviewRef.current, pitch, velocity)
  }

  function beginKeyPreview(pitch: number, event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return

    event.preventDefault()
    keyPreviewRef.current.active = true
    startHeldPreview(pitch)
  }

  function continueKeyPreview(pitch: number) {
    if (!keyPreviewRef.current.active) return
    changeHeldPreviewPitch(pitch)
  }

  function getKeyboardInputPitch(code: string) {
    const mappedPitch = KEYBOARD_INPUT_MAP[code]
    if (mappedPitch === undefined) return null
    if (!selectedTrack || !isDrumInstrument(selectedTrack.instrumentId)) return mappedPitch

    const drumIndex = KEYBOARD_INPUT_CODES.indexOf(code)
    return DRUM_KEYBOARD_PITCHES[Math.max(0, drumIndex) % DRUM_KEYBOARD_PITCHES.length]
  }

  function getPlaybackBeatAtEventTime(eventTimeStamp?: number) {
    if (!isPlaying) return playbackBeatRef.current

    const eventTime = typeof eventTimeStamp === 'number' && Number.isFinite(eventTimeStamp)
      ? eventTimeStamp
      : performance.now()
    const elapsedMs = Math.max(0, eventTime - playbackStartMsRef.current)
    const elapsedBeat = elapsedMs / 1000 / (60 / projectRef.current.tempo)
    return Math.min(totalBeats, playbackStartBeatRef.current + elapsedBeat)
  }

  function quantizeKeyboardBeat(beat: number) {
    const fineStep = 1 / 64
    return Math.max(0, Math.round(beat / fineStep) * fineStep)
  }

  function playLiveKeyboardInput(trackId: string, pitch: number, velocity: number) {
    const track = activePlaybackTracksRef.current.find((item) => item.id === trackId)
    if (!track) return null

    const noteInput = track.instrument.expectsMidi
      ? pitch
      : Tone.Frequency(pitch, 'midi').toFrequency()

    if (track.isDrum) {
      track.instrument.triggerAttackRelease(
        noteInput,
        getMinimumPlaybackDrumSeconds(pitch, MIN_DURATION_BEATS * (60 / projectRef.current.tempo)),
        Tone.now(),
        velocity,
      )
      return null
    }

    track.instrument.triggerAttack(noteInput, Tone.now(), velocity)
    return noteInput
  }

  function startKeyboardNote(code: string, eventTimeStamp?: number) {
    if (!keyboardInputEnabled || !isPlaying || !selectedTrack) return
    if (keyboardRecordingRef.current.has(code)) return

    const pitch = getKeyboardInputPitch(code)
    if (pitch === null) return

    const startBeat = quantizeKeyboardBeat(getPlaybackBeatAtEventTime(eventTimeStamp))
    const liveNoteInput = playLiveKeyboardInput(selectedTrack.id, pitch, 0.78)
    const note: Note = {
      id: createId('note'),
      pitch,
      startBeat,
      durationBeats: MIN_DURATION_BEATS,
      velocity: 0.78,
      pitchBend: 0,
      volume: 1,
      pan: 0,
      expression: 1,
      modulation: 0,
    }

    keyboardRecordingRef.current.set(code, {
      liveNoteInput,
      noteId: note.id,
      pitch,
      startBeat,
      trackId: selectedTrack.id,
    })
    setSelectedNoteIds([note.id])
    setProject((current) => ({
      ...current,
      selectedNoteId: note.id,
      notesByTrack: {
        ...current.notesByTrack,
        [selectedTrack.id]: [...(current.notesByTrack[selectedTrack.id] ?? []), note],
      },
    }))
    if (liveNoteInput === null && !isDrumInstrument(selectedTrack.instrumentId)) {
      void previewNote(selectedTrack.instrumentId, pitch, note.velocity, 0.25)
    }
  }

  function finishKeyboardNote(code: string, eventTimeStamp?: number) {
    const recording = keyboardRecordingRef.current.get(code)
    if (!recording) return

    keyboardRecordingRef.current.delete(code)
    const endBeat = Math.max(
      recording.startBeat + MIN_DURATION_BEATS,
      quantizeKeyboardBeat(getPlaybackBeatAtEventTime(eventTimeStamp)),
    )
    const durationBeats = Math.max(MIN_DURATION_BEATS, endBeat - recording.startBeat)
    if (recording.liveNoteInput !== null) {
      const track = activePlaybackTracksRef.current.find((item) => item.id === recording.trackId)
      track?.instrument.triggerRelease(recording.liveNoteInput, Tone.now())
    }

    setProject((current) => {
      const notes = current.notesByTrack[recording.trackId] ?? []
      return {
        ...current,
        notesByTrack: {
          ...current.notesByTrack,
          [recording.trackId]: notes.map((note) =>
            note.id === recording.noteId
              ? { ...note, durationBeats }
              : note,
          ),
        },
      }
    })
  }

  function cacheRollPointerGeometry() {
    const roll = pianoRollRef.current
    if (!roll) {
      rollPointerGeometryRef.current = null
      return
    }

    rollPointerGeometryRef.current = {
      gridWidth: Math.max(totalSteps * stepWidth, roll.clientWidth - KEY_COLUMN_WIDTH),
      rect: roll.getBoundingClientRect(),
      totalSteps,
    }
  }

  function getCurrentRollGridWidth() {
    const roll = pianoRollRef.current
    return Math.max(totalSteps * stepWidth, (roll?.clientWidth ?? 0) - KEY_COLUMN_WIDTH)
  }

  function getCellFromPointer(clientX: number, clientY: number) {
    const roll = pianoRollRef.current
    if (!roll) return null

    const geometry = rollPointerGeometryRef.current
    const rect = geometry?.rect ?? roll.getBoundingClientRect()
    const pointerTotalSteps = geometry?.totalSteps ?? totalSteps
    const gridWidth =
      geometry?.gridWidth ?? Math.max(pointerTotalSteps * stepWidth, roll.clientWidth - KEY_COLUMN_WIDTH)
    const x = clientX - rect.left - KEY_COLUMN_WIDTH + roll.scrollLeft
    const y = clientY - rect.top - ROLL_HEADER_HEIGHT + roll.scrollTop
    const step = Math.floor((x / gridWidth) * pointerTotalSteps)
    const rowIndex = Math.floor(y / ROLL_ROW_HEIGHT)

    if (step < 0 || step >= pointerTotalSteps || rowIndex < 0 || rowIndex >= rollPitches.length) return null
    return { pitch: rollPitches[rowIndex], rowIndex, step }
  }

  function getSelectionBounds(selection: PatternSelection) {
    const startStep = Math.min(selection.startStep, selection.endStep)
    const endStep = Math.max(selection.startStep, selection.endStep)
    const startRow = Math.min(selection.startRow, selection.endRow)
    const endRow = Math.max(selection.startRow, selection.endRow)

    return { endRow, endStep, startRow, startStep }
  }

  function updateSelectionBox(selection: PatternSelection) {
    if (!pianoRollRef.current) return

    const { endRow, endStep, startRow, startStep } = getSelectionBounds(selection)
    const cellWidth = getCurrentRollGridWidth() / totalSteps
    setSelectionBox({
      height: (endRow - startRow + 1) * ROLL_ROW_HEIGHT,
      left: KEY_COLUMN_WIDTH + startStep * cellWidth,
      selecting: selection.active,
      top: ROLL_HEADER_HEIGHT + startRow * ROLL_ROW_HEIGHT,
      width: (endStep - startStep + 1) * cellWidth,
    })
  }

  function updateSelectionBoxFromNotes(notes: Note[], selecting = false) {
    if (!pianoRollRef.current || notes.length === 0) return

    const rows = notes
      .map((note) => rollPitches.indexOf(note.pitch))
      .filter((rowIndex) => rowIndex >= 0)
    if (rows.length === 0) return

    const startStep = Math.min(...notes.map((note) => Math.round(note.startBeat * stepsPerBeat)))
    const endStep = Math.max(...notes.map((note) => Math.ceil((note.startBeat + note.durationBeats) * stepsPerBeat) - 1))
    const startRow = Math.min(...rows)
    const endRow = Math.max(...rows)
    const cellWidth = getCurrentRollGridWidth() / totalSteps

    setSelectionBox({
      height: (endRow - startRow + 1) * ROLL_ROW_HEIGHT,
      left: KEY_COLUMN_WIDTH + startStep * cellWidth,
      selecting,
      top: ROLL_HEADER_HEIGHT + startRow * ROLL_ROW_HEIGHT,
      width: (endStep - startStep + 1) * cellWidth,
    })
  }

  function selectNotesInPatternArea(selection: PatternSelection) {
    if (!selectedTrack) return

    const { endRow, endStep, startRow, startStep } = getSelectionBounds(selection)
    const startBeat = startStep / stepsPerBeat
    const endBeat = (endStep + 1) / stepsPerBeat
    const selectedIds = selectedTrackNotes
      .filter((note) => {
        const rowIndex = rollPitches.indexOf(note.pitch)
        const noteEndBeat = note.startBeat + note.durationBeats
        return (
          rowIndex >= startRow &&
          rowIndex <= endRow &&
          note.startBeat < endBeat &&
          noteEndBeat > startBeat
        )
      })
      .map((note) => note.id)

    setSelectedNoteIds(selectedIds)
    setProject((current) => {
      const nextSelectedNoteId = selectedIds[0] ?? null
      return current.selectedNoteId === nextSelectedNoteId
        ? current
        : { ...current, selectedNoteId: nextSelectedNoteId }
    })
  }

  function selectAllNotes() {
    if (!selectedTrack || selectedTrackNotes.length === 0) {
      setSelectedNoteIds([])
      setSelectionBox(null)
      setProject((current) => (
        current.selectedNoteId === null ? current : { ...current, selectedNoteId: null }
      ))
      return
    }

    const selectedIds = selectedTrackNotes.map((note) => note.id)
    setSelectedNoteIds(selectedIds)
    setEditMenuOpen(false)
    closePianoRollContextMenu()
    closeTrackContextMenu()
    cacheRollPointerGeometry()
    updateSelectionBoxFromNotes(selectedTrackNotes)
    setProject((current) => (
      current.selectedNoteId === selectedIds[0]
        ? current
        : { ...current, selectedNoteId: selectedIds[0] }
    ))
  }

  function getPointerLassoPoint(clientX: number, clientY: number): LassoPoint | null {
    const roll = pianoRollRef.current
    if (!roll) return null

    const geometry = rollPointerGeometryRef.current ?? {
      gridWidth: Math.max(totalSteps * stepWidth, roll.clientWidth - KEY_COLUMN_WIDTH),
      rect: roll.getBoundingClientRect(),
      totalSteps,
    }
    const gridX = clientX - geometry.rect.left - KEY_COLUMN_WIDTH + roll.scrollLeft
    const gridY = clientY - geometry.rect.top - ROLL_HEADER_HEIGHT + roll.scrollTop
    if (gridX < 0 || gridY < 0) return null

    return {
      gridX: Math.min(Math.max(gridX, 0), geometry.gridWidth),
      gridY: Math.min(Math.max(gridY, 0), rollPitches.length * ROLL_ROW_HEIGHT),
      viewX: KEY_COLUMN_WIDTH + Math.min(Math.max(gridX, 0), geometry.gridWidth),
      viewY: ROLL_HEADER_HEIGHT + Math.min(Math.max(gridY, 0), rollPitches.length * ROLL_ROW_HEIGHT),
    }
  }

  function isPointInPolygon(pointX: number, pointY: number, points: LassoPoint[]) {
    if (points.length < 3) return false

    let inside = false
    for (let index = 0, previousIndex = points.length - 1; index < points.length; previousIndex = index, index += 1) {
      const current = points[index]
      const previous = points[previousIndex]
      const intersects =
        current.gridY > pointY !== previous.gridY > pointY &&
        pointX < ((previous.gridX - current.gridX) * (pointY - current.gridY)) / (previous.gridY - current.gridY) + current.gridX
      if (intersects) inside = !inside
    }

    return inside
  }

  function selectNotesInLasso(points: LassoPoint[]) {
    if (!selectedTrack || points.length < 3) return

    const geometry = rollPointerGeometryRef.current
    if (!geometry) return

    const selectedIds = selectedTrackNotes
      .filter((note) => {
        const rowIndex = rollPitches.indexOf(note.pitch)
        if (rowIndex < 0) return false

        const noteCenterX = ((note.startBeat + note.durationBeats / 2) / totalBeats) * geometry.gridWidth
        const noteCenterY = (rowIndex + 0.5) * ROLL_ROW_HEIGHT
        return isPointInPolygon(noteCenterX, noteCenterY, points)
      })
      .map((note) => note.id)

    setSelectedNoteIds(selectedIds)
    setProject((current) => {
      const nextSelectedNoteId = selectedIds[0] ?? null
      return current.selectedNoteId === nextSelectedNoteId
        ? current
        : { ...current, selectedNoteId: nextSelectedNoteId }
    })
  }

  function beginLassoSelection(event: ReactPointerEvent<HTMLElement>) {
    event.preventDefault()
    event.stopPropagation()
    cacheRollPointerGeometry()
    const point = getPointerLassoPoint(event.clientX, event.clientY)
    if (!point) return

    setSelectionBox(null)
    setSelectedNoteIds([])
    lassoSelectionRef.current = { active: true, points: [point] }
    setLassoPoints([point])
  }

  function updateLassoSelectionFromPointer(clientX: number, clientY: number) {
    const lasso = lassoSelectionRef.current
    if (!lasso.active) return

    const point = getPointerLassoPoint(clientX, clientY)
    if (!point) return

    const previous = lasso.points.at(-1)
    if (previous && Math.hypot(previous.viewX - point.viewX, previous.viewY - point.viewY) < 4) return

    lasso.points = [...lasso.points, point]
    setLassoPoints(lasso.points)
    selectNotesInLasso(lasso.points)
  }

  function updatePatternSelectionFromPointer(clientX: number, clientY: number) {
    const selection = patternSelectionRef.current
    if (!selection?.active) return

    const cell = getCellFromPointer(clientX, clientY)
    if (!cell) return
    if (selection.endRow === cell.rowIndex && selection.endStep === cell.step) return

    selection.endRow = cell.rowIndex
    selection.endStep = cell.step
    updateSelectionBox(selection)
    selectNotesInPatternArea(selection)
  }

  function finishPatternSelection() {
    const selection = patternSelectionRef.current
    if (!selection?.active) return

    selectNotesInPatternArea(selection)
    updateSelectionBox({ ...selection, active: false })
    patternSelectionRef.current = null
  }

  function getStepFromRowPointer(row: HTMLElement, clientX: number) {
    const rect = row.getBoundingClientRect()
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width)
    return Math.min(totalSteps - 1, Math.max(0, Math.floor((x / rect.width) * totalSteps)))
  }

  function snapBeatToGrid(beat: number) {
    return Math.max(0, Math.round(beat * stepsPerBeat) / stepsPerBeat)
  }

  function clampBeatToSong(beat: number, durationBeats = 0) {
    return Math.max(0, Math.min(totalBeats - durationBeats, beat))
  }

  function getRowLabel(pitch: number) {
    if (selectedTrack && isDrumInstrument(selectedTrack.instrumentId)) {
      return DRUM_LABELS[pitch] ?? `Drum ${pitch}`
    }

    const name = getPitchName(pitch)
    return name.startsWith('C') ? name : ''
  }

  function getNoteDisplayLabel(note: Note) {
    if (selectedTrack && isDrumInstrument(selectedTrack.instrumentId)) {
      return DRUM_LABELS[note.pitch] ?? `Drum ${note.pitch}`
    }

    return getPitchName(note.pitch)
  }

  function findNoteAtCell(trackId: string, pitch: number, step: number) {
    const beat = step / stepsPerBeat
    return (project.notesByTrack[trackId] ?? []).find(
      (note) =>
        note.pitch === pitch &&
        beat >= note.startBeat &&
        beat < note.startBeat + note.durationBeats,
    )
  }

  function moveNoteToCell(noteId: string, trackId: string, pitch: number, step: number) {
    const beat = step / stepsPerBeat

    setProject((current) => {
      const currentNotes = current.notesByTrack[trackId] ?? []
      let changed = current.selectedNoteId !== noteId
      const nextNotes = currentNotes.map((note) => {
        if (note.id !== noteId) return note

        const startBeat = Math.max(0, Math.min(totalBeats - note.durationBeats, beat))
        if (note.pitch === pitch && nearlyEqual(note.startBeat, startBeat)) return note

        changed = true
        return {
          ...note,
          pitch,
          startBeat,
        }
      })

      if (!changed) return current

      return {
        ...current,
        selectedNoteId: noteId,
        notesByTrack: {
          ...current.notesByTrack,
          [trackId]: nextNotes,
        },
      }
    })
  }

  function moveDraggedNoteToCell(pitch: number, step: number) {
    const drag = noteDragRef.current
    if (!drag?.active) return
    if (drag.lastPitch === pitch && drag.lastStep === step) return

    const startStep = Math.max(0, step - drag.grabStepOffset)
    const startPitch = pitch - drag.grabPitchOffset
    if (drag.groupNoteIds.length > 1) {
      moveNoteGroupToCell(drag, startPitch, startStep)
    } else {
      moveNoteToCell(drag.noteId, drag.trackId, startPitch, startStep)
    }
    if (drag.lastPitch !== pitch) {
      changeHeldPreviewPitch(pitch)
    }
    drag.lastPitch = pitch
    drag.lastStep = step
  }

  function moveDraggedNoteFromPointer(clientX: number, clientY: number) {
    const cell = getCellFromPointer(clientX, clientY)
    if (!cell || !noteDragRef.current?.active) return
    moveDraggedNoteToCell(cell.pitch, cell.step)
  }

  function moveNoteGroupToCell(drag: NoteDrag, pitch: number, step: number) {
    const requestedPitchDelta = pitch - drag.originPitch
    const requestedStepDelta = step - drag.originStep
    const originalNotes = drag.originalNotes
    const minPitchDelta = Math.max(...originalNotes.map((note) => rollPitches[rollPitches.length - 1] - note.pitch))
    const maxPitchDelta = Math.min(...originalNotes.map((note) => rollPitches[0] - note.pitch))
    const minStepDelta = Math.max(...originalNotes.map((note) => -Math.round(note.startBeat * stepsPerBeat)))
    const maxStepDelta = Math.min(
      ...originalNotes.map((note) =>
        totalSteps - Math.round((note.startBeat + note.durationBeats) * stepsPerBeat),
      ),
    )
    const pitchDelta = Math.max(minPitchDelta, Math.min(maxPitchDelta, requestedPitchDelta))
    const stepDelta = Math.max(minStepDelta, Math.min(maxStepDelta, requestedStepDelta))
    const movedNotes = originalNotes.map((note) => ({
      ...note,
      pitch: note.pitch + pitchDelta,
      startBeat: Math.max(0, Math.min(totalBeats - note.durationBeats, note.startBeat + stepDelta / stepsPerBeat)),
    }))

    setProject((current) => {
      const currentNotes = current.notesByTrack[drag.trackId] ?? []
      const originalById = new Map(originalNotes.map((note) => [note.id, note]))
      let changed = current.selectedNoteId !== drag.noteId
      const nextNotes = currentNotes.map((note) => {
        const originalNote = originalById.get(note.id)
        if (!originalNote) return note

        const nextPitch = originalNote.pitch + pitchDelta
        const nextStartBeat = Math.max(0, Math.min(totalBeats - originalNote.durationBeats, originalNote.startBeat + stepDelta / stepsPerBeat))
        if (note.pitch === nextPitch && nearlyEqual(note.startBeat, nextStartBeat)) return note

        changed = true
        return {
          ...note,
          pitch: nextPitch,
          startBeat: nextStartBeat,
        }
      })

      if (!changed) return current

      return {
        ...current,
        selectedNoteId: drag.noteId,
        notesByTrack: {
          ...current.notesByTrack,
          [drag.trackId]: nextNotes,
        },
      }
    })
    updateSelectionBoxFromNotes(movedNotes)
  }

  function getGrabStepOffset(note: Note, pointerStep: number | null) {
    if (pointerStep === null) return 0

    const noteStartStep = Math.round(note.startBeat * stepsPerBeat)
    const noteDurationSteps = Math.max(1, Math.round(note.durationBeats * stepsPerBeat))
    return Math.max(0, Math.min(noteDurationSteps - 1, pointerStep - noteStartStep))
  }

  function beginSelectionBoxMove(event: ReactPointerEvent<HTMLSpanElement>) {
    if (event.button !== 0 || !selectedTrack || selectedPatternNotes.length === 0) return

    const pointerCell = getCellFromPointer(event.clientX, event.clientY)
    if (!pointerCell) return

    event.preventDefault()
    event.stopPropagation()
    cacheRollPointerGeometry()
    const selectedRows = selectedPatternNotes
      .map((note) => rollPitches.indexOf(note.pitch))
      .filter((rowIndex) => rowIndex >= 0)
    if (selectedRows.length === 0) return

    const topRow = Math.min(...selectedRows)
    const originPitch = rollPitches[topRow]
    const originStep = Math.min(
      ...selectedPatternNotes.map((note) => Math.round(note.startBeat * stepsPerBeat)),
    )
    const firstNote = selectedPatternNotes[0]
    noteDragRef.current = {
      active: true,
      grabPitchOffset: pointerCell.pitch - originPitch,
      grabStepOffset: Math.max(0, pointerCell.step - originStep),
      groupNoteIds: selectedPatternNotes.map((note) => note.id),
      noteId: firstNote.id,
      originalNotes: selectedPatternNotes,
      originPitch,
      originStep,
      trackId: selectedTrack.id,
      lastPitch: pointerCell.pitch,
      lastStep: pointerCell.step,
    }
    setDraggingNoteId(firstNote.id)
  }

  function eraseNoteAtCell(pitch: number, step: number) {
    const beat = step / stepsPerBeat
    const currentProject = projectRef.current
    const trackId = currentProject.selectedTrackId
    const noteToDelete = (currentProject.notesByTrack[trackId] ?? []).find(
      (note) =>
        note.pitch === pitch &&
        beat >= note.startBeat &&
        beat < note.startBeat + note.durationBeats,
    )

    if (!noteToDelete || erasedNoteIdsRef.current.has(noteToDelete.id)) return false
    erasedNoteIdsRef.current.add(noteToDelete.id)
    if (rightClickRollActionRef.current?.active) {
      rightClickRollActionRef.current.deleted = true
    }

    setProject((current) => {
      const nextProject = {
        ...current,
        selectedNoteId: null,
        notesByTrack: {
          ...current.notesByTrack,
          [trackId]: (current.notesByTrack[trackId] ?? []).filter(
            (note) => note.id !== noteToDelete.id,
          ),
        },
      }
      projectRef.current = nextProject
      return nextProject
    })
    return true
  }

  function eraseNoteAtCellOnce(pitch: number, step: number, eraseState: { lastKey: string }) {
    const key = `${pitch}-${step}`
    if (eraseState.lastKey === key) return false
    eraseState.lastKey = key
    return eraseNoteAtCell(pitch, step)
  }

  function eraseDraggedCellFromPointer(clientX: number, clientY: number) {
    if (!eraseRef.current.active) return
    const cell = getCellFromPointer(clientX, clientY)
    if (!cell) return
    eraseNoteAtCellOnce(cell.pitch, cell.step, eraseRef.current)
  }

  function eraseRightDraggedCellFromPointer(clientX: number, clientY: number) {
    if (!rightEraseRef.current.active) return
    const cell = getCellFromPointer(clientX, clientY)
    if (!cell) return
    eraseNoteAtCellOnce(cell.pitch, cell.step, rightEraseRef.current)
  }

  function beginPatternSelection(pitch: number, step: number, event: ReactPointerEvent<HTMLElement>) {
    const rowIndex = rollPitches.indexOf(pitch)
    if (rowIndex < 0) return

    event.preventDefault()
    event.stopPropagation()
    setSelectionBox(null)
    cacheRollPointerGeometry()
    const selection = {
      active: true,
      endRow: rowIndex,
      endStep: step,
      startRow: rowIndex,
      startStep: step,
    }
    patternSelectionRef.current = selection
    setSelectedNoteIds([])
    updateSelectionBox(selection)
    selectNotesInPatternArea(selection)
  }

  function changeToolMode(nextToolMode: ToolMode) {
    setToolMode(nextToolMode)
    if (nextToolMode !== 'select') {
      setSelectionBox(null)
      patternSelectionRef.current = null
    }
    if (nextToolMode !== 'lasso') {
      lassoSelectionRef.current = { active: false, points: [] }
      setLassoPoints([])
    }
  }

  function beginMoveNote(note: Note, event: ReactPointerEvent<HTMLButtonElement>) {
    if (!selectedTrack || event.button !== 0) return

    event.preventDefault()
    event.stopPropagation()
    const isSelectedNote = selectedNoteIdSet.has(note.id)
    const isPatternMember = isSelectedNote && selectedNoteIds.length > 1
    if (toolMode === 'select' && !isSelectedNote) {
      setSelectedNoteIds([note.id])
      setSelectionBox(null)
      lastNoteDurationRef.current = note.durationBeats
      setProject((current) =>
        current.selectedNoteId === note.id ? current : { ...current, selectedNoteId: note.id },
      )
      return
    }

    if (toolMode === 'erase') {
      cacheRollPointerGeometry()
      eraseRef.current = { active: true, lastKey: '' }
      erasedNoteIdsRef.current = new Set([note.id])
      deleteNote(note.id)
      return
    }

    setProject((current) =>
      current.selectedNoteId === note.id ? current : { ...current, selectedNoteId: note.id },
    )
    if (!isPatternMember) {
      setSelectedNoteIds([note.id])
      setSelectionBox(null)
    }
    lastNoteDurationRef.current = note.durationBeats
    setDraggingNoteId(note.id)
    cacheRollPointerGeometry()
    const pointerCell = getCellFromPointer(event.clientX, event.clientY)
    const noteStartStep = Math.round(note.startBeat * stepsPerBeat)
    const groupNoteIds = isPatternMember ? selectedNoteIds : [note.id]
    const groupNoteIdSet = new Set(groupNoteIds)
    noteDragRef.current = {
      active: true,
      grabPitchOffset: 0,
      grabStepOffset: getGrabStepOffset(note, pointerCell?.step ?? null),
      groupNoteIds,
      noteId: note.id,
      originalNotes: selectedTrackNotes.filter((item) => groupNoteIdSet.has(item.id)),
      originPitch: note.pitch,
      originStep: noteStartStep,
      trackId: selectedTrack.id,
      lastPitch: note.pitch,
      lastStep: pointerCell?.step ?? noteStartStep,
    }
    startHeldPreview(note.pitch, note.velocity)
  }

  function beginPatternRepeat(event: ReactPointerEvent<HTMLSpanElement>) {
    if (event.button !== 0 || !selectedTrack || selectedPatternNotes.length === 0 || !selectionBox) return

    event.preventDefault()
    event.stopPropagation()
    const baseStartBeat = Math.min(...selectedPatternNotes.map((note) => note.startBeat))
    const baseEndBeat = Math.max(...selectedPatternNotes.map((note) => note.startBeat + note.durationBeats))
    if (baseEndBeat <= baseStartBeat) return

    patternRepeatRef.current = {
      active: true,
      baseEndBeat,
      baseStartBeat,
      baseWidth: selectionBox.width,
      currentWidth: selectionBox.width,
      gapBeats: PATTERN_REPEAT_GAP_BEATS,
      notes: selectedPatternNotes,
      repeatCount: 1,
      startClientX: event.clientX,
      trackId: selectedTrack.id,
    }
  }

  function updatePatternRepeatPreview(clientX: number) {
    const repeat = patternRepeatRef.current
    if (!repeat?.active) return

    const gapWidth = repeat.gapBeats * beatWidth
    const unitWidth = Math.max(1, repeat.baseWidth + gapWidth)
    const dragDistance = Math.max(0, clientX - repeat.startClientX)
    const nextRepeatCount = Math.max(1, Math.floor(dragDistance / unitWidth) + 1)
    if (nextRepeatCount === repeat.repeatCount) return

    const nextWidth = repeat.baseWidth * nextRepeatCount + gapWidth * (nextRepeatCount - 1)
    repeat.repeatCount = nextRepeatCount
    repeat.currentWidth = nextWidth
    setSelectionBox((current) => (current ? { ...current, selecting: false, width: nextWidth } : current))
  }

  function finishPatternRepeat() {
    const repeat = patternRepeatRef.current
    if (!repeat?.active) return
    patternRepeatRef.current = null

    const repeatCount = repeat.repeatCount
    if (repeatCount <= 1) return

    const spanBeats = repeat.baseEndBeat - repeat.baseStartBeat
    const repeatStepBeats = spanBeats + repeat.gapBeats
    const nextNotes: Note[] = []
    for (let repeatIndex = 1; repeatIndex < repeatCount; repeatIndex += 1) {
      const beatOffset = repeatStepBeats * repeatIndex
      repeat.notes.forEach((note) => {
        nextNotes.push({
          ...note,
          id: createId('note'),
          startBeat: snapBeatToGrid(note.startBeat + beatOffset),
        })
      })
    }

    const nextSelectedIds = [...repeat.notes.map((note) => note.id), ...nextNotes.map((note) => note.id)]
    setSelectedNoteIds(nextSelectedIds)
    updateSelectionBoxFromNotes([...repeat.notes, ...nextNotes])
    setProject((current) => ({
      ...current,
      selectedNoteId: nextSelectedIds[0] ?? current.selectedNoteId,
      notesByTrack: {
        ...current.notesByTrack,
        [repeat.trackId]: [...(current.notesByTrack[repeat.trackId] ?? []), ...nextNotes],
      },
    }))
  }

  function beginRightEraseNote(note: Note, event: ReactPointerEvent<HTMLButtonElement>) {
    if (!selectedTrack || event.button !== 2) return
    beginRightClickRollAction(event, { deleteImmediately: true, note })
  }

  function beginCellAction(pitch: number, step: number, event: ReactPointerEvent<HTMLElement>) {
    if (!selectedTrack) return

    if (event.button === 2) {
      beginRightClickRollAction(event)
      return
    }

    if (event.button !== 0) return

    event.preventDefault()
    if (toolMode === 'erase') {
      cacheRollPointerGeometry()
      eraseRef.current = { active: true, lastKey: '' }
      erasedNoteIdsRef.current = new Set()
      eraseNoteAtCellOnce(pitch, step, eraseRef.current)
      return
    }

    if (toolMode === 'lasso' || event.altKey) {
      beginLassoSelection(event)
      return
    }

    if (toolMode === 'select' || event.shiftKey) {
      beginPatternSelection(pitch, step, event)
      return
    }

    const existingNote = findNoteAtCell(selectedTrack.id, pitch, step)
    if (existingNote) {
      setDraggingNoteId(existingNote.id)
      cacheRollPointerGeometry()
      const existingNoteStartStep = Math.round(existingNote.startBeat * stepsPerBeat)
      noteDragRef.current = {
        active: true,
        grabPitchOffset: 0,
        grabStepOffset: getGrabStepOffset(existingNote, step),
        groupNoteIds: [existingNote.id],
        noteId: existingNote.id,
        originalNotes: [existingNote],
        originPitch: pitch,
        originStep: existingNoteStartStep,
        trackId: selectedTrack.id,
        lastPitch: pitch,
        lastStep: step,
      }
      setProject((current) =>
        current.selectedNoteId === existingNote.id
          ? current
          : { ...current, selectedNoteId: existingNote.id },
      )
      setSelectedNoteIds([existingNote.id])
      lastNoteDurationRef.current = existingNote.durationBeats
      startHeldPreview(pitch, existingNote.velocity)
      return
    }

    const note: Note = {
      id: createId('note'),
      pitch,
      startBeat: step / stepsPerBeat,
      durationBeats: Math.min(defaultDurationBeats, totalBeats - step / stepsPerBeat),
      velocity: 0.78,
      pitchBend: 0,
      volume: 1,
      pan: 0,
      expression: 1,
      modulation: 0,
    }

    cacheRollPointerGeometry()
    noteDragRef.current = {
      active: true,
      grabPitchOffset: 0,
      grabStepOffset: 0,
      groupNoteIds: [note.id],
      noteId: note.id,
      originalNotes: [note],
      originPitch: pitch,
      originStep: step,
      trackId: selectedTrack.id,
      lastPitch: pitch,
      lastStep: step,
    }
    setDraggingNoteId(note.id)
    setSelectedNoteIds([note.id])
    lastNoteDurationRef.current = note.durationBeats
    startHeldPreview(pitch, note.velocity)

    setProject((current) => ({
      ...current,
      selectedNoteId: note.id,
      notesByTrack: {
        ...current.notesByTrack,
        [selectedTrack.id]: [...(current.notesByTrack[selectedTrack.id] ?? []), note],
      },
    }))
  }

  function beginRowAction(pitch: number, event: ReactPointerEvent<HTMLDivElement>) {
    beginCellAction(pitch, getStepFromRowPointer(event.currentTarget, event.clientX), event)
  }

  function beginRowContextErase(_pitch: number, event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault()
  }

  function deleteSelectedNote() {
    if (!selectedTrack) return
    if (selectedNoteIds.length > 1) {
      deleteSelectedNotes()
      return
    }
    if (!selectedNote) return
    deleteNote(selectedNote.id)
  }

  function deleteSelectedNotes() {
    if (!selectedTrack || selectedNoteIds.length === 0) return

    const idsToDelete = new Set(selectedNoteIds)
    setSelectedNoteIds([])
    setSelectionBox(null)
    setProject((current) => ({
      ...current,
      selectedNoteId: null,
      notesByTrack: {
        ...current.notesByTrack,
        [selectedTrack.id]: (current.notesByTrack[selectedTrack.id] ?? []).filter(
          (note) => !idsToDelete.has(note.id),
        ),
      },
    }))
  }

  function deleteNote(noteId: string) {
    if (!selectedTrack) return

    setSelectedNoteIds((current) => current.filter((id) => id !== noteId))
    setSelectionBox(null)
    setProject((current) => ({
      ...current,
      selectedNoteId: current.selectedNoteId === noteId ? null : current.selectedNoteId,
      notesByTrack: {
        ...current.notesByTrack,
        [selectedTrack.id]: (current.notesByTrack[selectedTrack.id] ?? []).filter(
          (note) => note.id !== noteId,
        ),
      },
    }))
  }

  function getSelectedNoteValue(key: keyof Pick<Note, 'velocity' | 'pitchBend' | 'volume' | 'pan' | 'expression' | 'modulation'>) {
    if (editableSelectedNotes.length === 0) return key === 'pan' || key === 'pitchBend' ? 0 : 1

    const fallback = key === 'pan' || key === 'pitchBend' ? 0 : 1
    return editableSelectedNotes.reduce((total, note) => total + Number(note[key] ?? fallback), 0) / editableSelectedNotes.length
  }

  function updateSelectedNotes(
    updates: Partial<Pick<Note, 'velocity' | 'pitchBend' | 'volume' | 'pan' | 'expression' | 'modulation'>>,
  ) {
    if (!selectedTrack || editableSelectedNotes.length === 0) return

    const targetIds = new Set(editableSelectedNotes.map((note) => note.id))
    setProject((current) => {
      let changed = false
      const nextNotes = (current.notesByTrack[selectedTrack.id] ?? []).map((note) => {
        if (!targetIds.has(note.id)) return note

        const nextNote = { ...note, ...updates }
        if (Object.entries(updates).some(([key, value]) => note[key as keyof Note] !== value)) {
          changed = true
          return nextNote
        }

        return note
      })

      return changed
        ? {
            ...current,
            notesByTrack: {
              ...current.notesByTrack,
              [selectedTrack.id]: nextNotes,
            },
          }
        : current
    })
  }

  function updateAudioClipVolume(clipId: string, volume: number) {
    const nextVolume = Math.round(Math.max(0, Math.min(1.5, volume)) * 100) / 100
    setProject((current) => {
      let changed = false
      const audioClips = (current.audioClips ?? []).map((clip) => {
        if (clip.id !== clipId || nearlyEqual(clip.volume, nextVolume)) return clip
        changed = true
        return { ...clip, volume: nextVolume }
      })
      return changed ? { ...current, audioClips } : current
    })
  }

  function adjustAudioClipVolumeFromPointer(clip: AudioClip, event: ReactPointerEvent<HTMLElement>) {
    const target = event.currentTarget
    const rect = target.getBoundingClientRect()
    const setFromClientY = (clientY: number) => {
      const ratio = 1 - Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
      updateAudioClipVolume(clip.id, 0.15 + ratio * 1.35)
    }

    event.preventDefault()
    setFromClientY(event.clientY)

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setFromClientY(moveEvent.clientY)
    }
    const stop = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }

  function updateNoteEvent(noteId: string, updates: Partial<Pick<Note, 'pitch' | 'startBeat' | 'durationBeats' | 'velocity'>>) {
    if (!selectedTrack) return

    setProject((current) => {
      let changed = false
      const nextNotes = (current.notesByTrack[selectedTrack.id] ?? []).map((note) => {
        if (note.id !== noteId) return note

        const nextNote = {
          ...note,
          ...updates,
          durationBeats: Math.max(MIN_DURATION_BEATS, updates.durationBeats ?? note.durationBeats),
          pitch: Math.max(0, Math.min(127, Math.round(updates.pitch ?? note.pitch))),
          startBeat: Math.max(0, updates.startBeat ?? note.startBeat),
        }

        if (
          note.pitch !== nextNote.pitch ||
          !nearlyEqual(note.startBeat, nextNote.startBeat) ||
          !nearlyEqual(note.durationBeats, nextNote.durationBeats) ||
          !nearlyEqual(note.velocity, nextNote.velocity)
        ) {
          changed = true
          return nextNote
        }

        return note
      })

      return changed
        ? {
            ...current,
            selectedNoteId: noteId,
            notesByTrack: {
              ...current.notesByTrack,
              [selectedTrack.id]: nextNotes,
            },
          }
        : current
    })
  }

  function resizeNote(noteId: string, durationBeats: number) {
    if (!selectedTrack) return

    setProject((current) => {
      const currentNotes = current.notesByTrack[selectedTrack.id] ?? []
      let changed = current.selectedNoteId !== noteId
      const nextNotes = currentNotes.map((note) => {
        if (note.id !== noteId) return note

        const nextDurationBeats = Math.max(
          MIN_DURATION_BEATS,
          Math.min(totalBeats - note.startBeat, durationBeats),
        )
        if (nearlyEqual(note.durationBeats, nextDurationBeats)) return note

        changed = true
        lastNoteDurationRef.current = nextDurationBeats
        return {
          ...note,
          durationBeats: nextDurationBeats,
        }
      })

      if (!changed) return current

      return {
        ...current,
        selectedNoteId: noteId,
        notesByTrack: {
          ...current.notesByTrack,
          [selectedTrack.id]: nextNotes,
        },
      }
    })
  }

  function startResizingNote(note: Note, event: ReactPointerEvent<HTMLSpanElement>) {
    const row = event.currentTarget.closest('.step-row')
    if (!(row instanceof HTMLElement)) return

    event.preventDefault()
    event.stopPropagation()
    setResizingNoteId(note.id)
    setProject((current) =>
      current.selectedNoteId === note.id ? current : { ...current, selectedNoteId: note.id },
    )

    const rowRect = row.getBoundingClientRect()
    let pendingClientX = event.clientX
    let resizeFrameId = 0

    function applyPendingResize() {
      resizeFrameId = 0
      const x = Math.min(Math.max(pendingClientX - rowRect.left, 0), rowRect.width)
      const step = Math.ceil((x / rowRect.width) * totalSteps)
      const endBeat = step / stepsPerBeat
      resizeNote(note.id, endBeat - note.startBeat)
    }

    function handlePointerMove(moveEvent: PointerEvent) {
      pendingClientX = moveEvent.clientX
      if (resizeFrameId === 0) {
        resizeFrameId = window.requestAnimationFrame(applyPendingResize)
      }
    }

    function stopResizing() {
      if (resizeFrameId !== 0) {
        window.cancelAnimationFrame(resizeFrameId)
        applyPendingResize()
      }
      setResizingNoteId(null)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopResizing)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopResizing)
  }

  function copySelectedNotes() {
    if (!selectedTrack || selectedPatternNotes.length === 0) return

    const sortedNotes = [...selectedPatternNotes].sort((left, right) => (
      left.startBeat - right.startBeat || left.pitch - right.pitch
    ))
    const firstBeat = Math.min(...sortedNotes.map((note) => note.startBeat))
    const lastBeat = Math.max(...sortedNotes.map((note) => note.startBeat + note.durationBeats))
    patternClipboardRef.current = {
      nextPasteBeat: lastBeat,
      notes: sortedNotes.map((note) => ({
        ...note,
        startBeat: snapBeatToGrid(note.startBeat - firstBeat),
        durationBeats: snapBeatToGrid(note.durationBeats),
      })),
      sourceTrackId: selectedTrack.id,
    }
    setEditMenuOpen(false)
  }

  function cutSelectedNotes() {
    if (!selectedTrack || selectedPatternNotes.length === 0) return

    copySelectedNotes()
    deleteSelectedNotes()
    setEditMenuOpen(false)
  }

  function pasteSelectedNotes() {
    if (!selectedTrack || !patternClipboardRef.current) return

    const clipboard = patternClipboardRef.current
    const currentBeat = getCurrentPlaybackBeat()
    const requestedPasteBeat = currentBeat > FLOAT_EPSILON ? currentBeat : clipboard.nextPasteBeat
    const pasteBeat = clampBeatToSong(snapBeatToGrid(requestedPasteBeat))
    const pastedNotes = clipboard.notes.map((note) => ({
      ...note,
      id: createId('note'),
      startBeat: clampBeatToSong(snapBeatToGrid(pasteBeat + note.startBeat), note.durationBeats),
    }))
    const pastedIds = pastedNotes.map((note) => note.id)
    const pastedEndBeat = Math.max(...pastedNotes.map((note) => note.startBeat + note.durationBeats))

    patternClipboardRef.current = {
      ...clipboard,
      nextPasteBeat: pastedEndBeat,
    }
    setSelectionBox(null)
    setSelectedNoteIds(pastedIds)
    setProject((current) => ({
      ...current,
      selectedNoteId: pastedIds[0] ?? null,
      notesByTrack: {
        ...current.notesByTrack,
        [selectedTrack.id]: [...(current.notesByTrack[selectedTrack.id] ?? []), ...pastedNotes],
      },
    }))
    setEditMenuOpen(false)
  }

  function duplicateSelectedNotes() {
    copySelectedNotes()
    pasteSelectedNotes()
  }

  function createNewProject() {
    resetPlayback()
    setSelectedNoteIds([])
    patternClipboardRef.current = null
    undoStackRef.current = []
    redoStackRef.current = []
    restoreProject(createInitialProject())
    setFileMenuOpen(false)
  }

  function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'))
      reader.onload = () => resolve(String(reader.result))
      reader.readAsDataURL(blob)
    })
  }

  function getAudioDurationFromDataUrl(dataUrl: string) {
    return new Promise<number>((resolve) => {
      const audio = new Audio()
      audio.preload = 'metadata'
      audio.onloadedmetadata = () => {
        resolve(Number.isFinite(audio.duration) ? audio.duration : 1)
      }
      audio.onerror = () => resolve(1)
      audio.src = dataUrl
    })
  }

  async function getAudioWaveform(blob: Blob, bars = 96) {
    try {
      const arrayBuffer = await blob.arrayBuffer()
      const context = new AudioContext()
      const buffer = await context.decodeAudioData(arrayBuffer.slice(0))
      const channel = buffer.getChannelData(0)
      const samplesPerBar = Math.max(1, Math.floor(channel.length / bars))
      const waveform = Array.from({ length: bars }, (_, barIndex) => {
        const start = barIndex * samplesPerBar
        const end = Math.min(channel.length, start + samplesPerBar)
        let peak = 0
        for (let index = start; index < end; index += 1) {
          peak = Math.max(peak, Math.abs(channel[index]))
        }
        return Math.round(Math.min(1, peak) * 100) / 100
      })
      await context.close()
      return waveform
    } catch {
      return Array.from({ length: bars }, (_, index) => 0.24 + Math.sin(index * 0.31) * 0.14)
    }
  }

  async function addAudioClipToTrack(trackId: string, blob: Blob, name: string, durationSeconds?: number, startBeatOverride?: number) {
    const dataUrl = await blobToDataUrl(blob)
    const resolvedDurationSeconds = durationSeconds ?? await getAudioDurationFromDataUrl(dataUrl)
    const startBeat = snapBeatToGrid(startBeatOverride ?? getCurrentPlaybackBeat())
    const durationBeats = Math.max(MIN_DURATION_BEATS, resolvedDurationSeconds / (60 / projectRef.current.tempo))
    const clip: AudioClip = {
      id: createId('audio'),
      trackId,
      name,
      dataUrl,
      startBeat,
      durationBeats,
      volume: 1,
      pan: 0,
      waveform: await getAudioWaveform(blob),
    }

    setProject((current) => ({
      ...current,
      audioClips: [...(current.audioClips ?? []), clip],
    }))
  }

  async function addAudioFileAsTrack(file: File) {
    const trackId = createId('track')
    const name = file.name.replace(/\.[^.]+$/, '') || '오디오 파일'
    const dataUrl = await blobToDataUrl(file)
    const resolvedDurationSeconds = await getAudioDurationFromDataUrl(dataUrl)
    const waveform = await getAudioWaveform(file)
    const startBeat = snapBeatToGrid(getCurrentPlaybackBeat())
    const durationBeats = Math.max(MIN_DURATION_BEATS, resolvedDurationSeconds / (60 / projectRef.current.tempo))
    const nextTrack: Track = {
      id: trackId,
      name,
      instrumentId: 'audio-track',
      kind: 'audio',
      volume: 0.95,
      pan: 0,
      mute: false,
      channel: Math.min(16, projectRef.current.tracks.length + 1),
      color: TRACK_COLORS[projectRef.current.tracks.length % TRACK_COLORS.length],
    }
    const clip: AudioClip = {
      id: createId('audio'),
      trackId,
      name,
      dataUrl,
      startBeat,
      durationBeats,
      volume: 1,
      pan: 0,
      waveform,
    }

    setProject((current) => ({
      ...current,
      selectedTrackId: trackId,
      selectedNoteId: null,
      tracks: [...current.tracks, nextTrack],
      notesByTrack: { ...current.notesByTrack, [trackId]: [] },
      audioClips: [...(current.audioClips ?? []), clip],
    }))
    setSelectedNoteIds([])
    setActiveEditorTab('arrange')
  }

  function openAudioUpload() {
    audioFileInputRef.current?.click()
  }

  async function importAudioFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return

    for (const file of files) {
      if (!file.type.startsWith('audio/')) continue
      await addAudioFileAsTrack(file)
    }
  }

  async function toggleVoiceRecording() {
    if (isRecordingVoice) {
      mediaRecorderRef.current?.stop()
      return
    }

    if (!selectedTrack) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      recordingChunksRef.current = []
      recordingStartBeatRef.current = getCurrentPlaybackBeat()
      recordingStartMsRef.current = performance.now()
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const durationSeconds = Math.max(0.25, (performance.now() - recordingStartMsRef.current) / 1000)
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        const trackId = selectedTrack.id
        stream.getTracks().forEach((track) => track.stop())
        setIsRecordingVoice(false)
        void addAudioClipToTrack(trackId, blob, `녹음 ${new Date().toLocaleTimeString('ko-KR')}`, durationSeconds, recordingStartBeatRef.current)
      }
      mediaRecorderRef.current = recorder
      setIsRecordingVoice(true)
      recorder.start()
    } catch {
      setIsRecordingVoice(false)
      alert('마이크 권한을 받을 수 없어서 녹음을 시작하지 못했습니다.')
    }
  }

  function saveProjectFile() {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${project.title || 'beginner-music'}.json`
    link.click()
    URL.revokeObjectURL(url)
    setFileMenuOpen(false)
  }

  function saveMidiFile() {
    if ((project.audioClips ?? []).length > 0) {
      alert('녹음이나 오디오 파일이 들어간 프로젝트는 MIDI로 저장할 수 없습니다. MP3 저장을 사용해 주세요.')
      setFileMenuOpen(false)
      return
    }

    const midiBytes = exportMidiProject(project)
    const blob = new Blob([midiBytes], { type: 'audio/midi' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${project.title || 'beginner-music'}.mid`
    link.click()
    URL.revokeObjectURL(url)
    setFileMenuOpen(false)
  }

  async function saveMp3File() {
    if (isExportingMp3) return

    setIsExportingMp3(true)
    setFileMenuOpen(false)
    try {
      const blob = await exportMp3Project(projectRef.current)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${projectRef.current.title || 'beginner-music'}.mp3`
      link.click()
      URL.revokeObjectURL(url)
    } catch {
        alert('음악 파일을 만들지 못했습니다. 음표가 너무 많거나 브라우저 오디오 만들기가 실패했을 수 있습니다.')
    } finally {
      setIsExportingMp3(false)
    }
  }

  function getAutoMixRole(track: Track) {
    const program = track.instrumentId.startsWith('gm-')
      ? Number(track.instrumentId.slice(3))
      : null

    if (isDrumInstrument(track.instrumentId)) return '리듬 중심'
    if (program !== null && program >= 32 && program < 40) return '저음 받침'
    if (program !== null && program >= 24 && program < 32) return '리듬 악기'
    if (program !== null && program >= 40 && program < 56) return '배경 선율'
    if (program !== null && program >= 56 && program < 64) return '주요 선율'
    if (program !== null && program >= 64 && program < 80) return '보조 선율'
    if (program !== null && program >= 80 && program < 96) return '신스 선율'
    if (program !== null && program >= 88 && program < 104) return '공간 배경'
    return '중심 악기'
  }

  function getAutoMixBaseVolume(track: Track) {
    const role = getAutoMixRole(track)
    if (role === '리듬 중심') return 0.92
    if (role === '저음 받침') return 0.82
    if (role === '주요 선율') return 0.9
    if (role === '리듬 악기') return 0.68
    if (role === '배경 선율') return 0.58
    if (role === '보조 선율') return 0.62
    if (role === '신스 선율') return 0.64
    if (role === '공간 배경') return 0.48
    return 0.74
  }

  function getAutoMixPan(track: Track, index: number) {
    if (isDrumInstrument(track.instrumentId)) return 0
    const role = getAutoMixRole(track)
    if (role === '저음 받침' || role === '주요 선율') return 0
    const side = index % 2 === 0 ? -1 : 1
    if (role === '리듬 악기') return side * 0.28
    if (role === '배경 선율' || role === '공간 배경') return side * 0.42
    return side * 0.18
  }

  function getDefaultAutoMixPriority(track: Track) {
    if (isDrumInstrument(track.instrumentId)) return 4
    const program = track.instrumentId.startsWith('gm-')
      ? Number(track.instrumentId.slice(3))
      : null

    if (program !== null && program >= 32 && program < 40) return 4
    if (program !== null && program >= 56 && program < 64) return 4
    if (program !== null && program >= 40 && program < 56) return 3
    return 3
  }

  function getSectionOverlap(note: Note, section: AutoMixSection) {
    const noteStart = note.startBeat
    const noteEnd = note.startBeat + note.durationBeats
    return Math.max(0, Math.min(noteEnd, section.endBeat) - Math.max(noteStart, section.startBeat))
  }

  function getAutoMixPriorityFactor(track: Track, notes: Note[], sections: AutoMixSection[]) {
    if (sections.length === 0 || notes.length === 0) return 1

    let weightedPriority = 0
    let weightedOverlap = 0
    sections.forEach((section) => {
      const sectionLength = Math.max(0.25, section.endBeat - section.startBeat)
      const overlap = notes.reduce((total, note) => total + getSectionOverlap(note, section), 0)
      if (overlap <= 0) return

      const priority = section.priorities[track.id] ?? getDefaultAutoMixPriority(track)
      const intensity = Math.min(1, Math.max(0, section.intensity))
      const weight = Math.min(1, overlap / sectionLength) * intensity
      weightedPriority += priority * weight
      weightedOverlap += weight
    })

    if (weightedOverlap <= 0) return 1

    const priority = weightedPriority / weightedOverlap
    return Math.max(0.46, Math.min(1.7, 1 + (priority - 3) * 0.26))
  }

  function getAutoMixNoteVolume(track: Track, note: Note, sections: AutoMixSection[]) {
    if (sections.length === 0) return note.volume ?? 1

    let weightedPriority = 0
    let weightedOverlap = 0
    sections.forEach((section) => {
      const overlap = getSectionOverlap(note, section)
      if (overlap <= 0) return

      const priority = section.priorities[track.id] ?? getDefaultAutoMixPriority(track)
      const intensity = Math.min(1, Math.max(0, section.intensity))
      const weight = (overlap / Math.max(0.25, note.durationBeats)) * intensity
      weightedPriority += priority * weight
      weightedOverlap += weight
    })

    if (weightedOverlap <= 0) return note.volume ?? 1

    const priority = weightedPriority / weightedOverlap
    const nextVolume = 1 + (priority - 3) * 0.2
    return Math.round(Math.max(0.42, Math.min(1.45, nextVolume)) * 100) / 100
  }

  function getAutoMixFocusTrackId(section: AutoMixSection) {
    const entries = Object.entries(section.priorities)
    if (entries.length === 0) return project.tracks[0]?.id ?? ''

    return entries.reduce((best, current) => (
      current[1] > best[1] ? current : best
    ), entries[0])[0]
  }

  function autoMixTracks() {
    let report: AutoMixReportItem[] = []
    setProject((current) => {
      const mixLength = Math.max(DEFAULT_PROJECT_LENGTH_BEATS, current.lengthBeats ?? 0, getNotesEndBeat(current.notesByTrack))
      const sections = (current.autoMixSections ?? []).length > 0
        ? current.autoMixSections ?? []
        : [
            {
              id: createId('automix'),
              name: '전체 곡',
              startBeat: 0,
              endBeat: Math.max(DEFAULT_PROJECT_LENGTH_BEATS, getNotesEndBeat(current.notesByTrack)),
              intensity: 0.75,
              priorities: Object.fromEntries(
                current.tracks.map((track) => [track.id, getDefaultAutoMixPriority(track)]),
              ),
            },
          ]
      const analyzedTracks = current.tracks.map((track, index) => {
        const notes = current.notesByTrack[track.id] ?? []
        if (notes.length === 0) {
          return {
            nextPan: getAutoMixPan(track, index),
            nextVolume: Math.round(getAutoMixBaseVolume(track) * 100) / 100,
            noteCount: 0,
            role: getAutoMixRole(track),
            track,
          }
        }

        const energy = notes.reduce(
          (total, note) => total + note.durationBeats * note.velocity * note.velocity,
          0,
        )
        const density = notes.length / Math.max(1, mixLength)
        const rms = Math.sqrt(energy / Math.max(1, mixLength))
        const priorityFactor = getAutoMixPriorityFactor(track, notes, sections)
        const densityTrim = Math.max(0.72, 1 - density * 0.1)
        const loudnessTrim = Math.max(0.72, Math.min(1.18, 0.74 / Math.max(0.18, rms)))
        const baseVolume = getAutoMixBaseVolume(track)
        const nextVolume = Math.round(
          Math.max(0.24, Math.min(1, baseVolume * priorityFactor * densityTrim * loudnessTrim)) * 100,
        ) / 100

        return {
          nextPan: getAutoMixPan(track, index),
          nextVolume,
          noteCount: notes.length,
          role: getAutoMixRole(track),
          track,
        }
      })
      const nextTracks = analyzedTracks.map(({ nextPan, nextVolume, track }) => {
        return nearlyEqual(track.volume, nextVolume) && nearlyEqual(track.pan ?? 0, nextPan)
          ? track
          : { ...track, pan: nextPan, volume: nextVolume }
      })
      let notesChanged = false
      const noteChangeCounts = new Map<string, number>()
      const nextNotesByTrack = Object.fromEntries(
        current.tracks.map((track) => {
          const notes = current.notesByTrack[track.id] ?? []
          let trackNotesChanged = false
          let trackNoteChanges = 0
          const nextTrackPan = nextTracks.find((item) => item.id === track.id)?.pan ?? 0
          const nextNotes = notes.map((note) => {
            const nextVolume = getAutoMixNoteVolume(track, note, sections)
            const nextPan = Math.max(-1, Math.min(1, (note.pan ?? 0) * 0.35 + nextTrackPan * 0.65))
            if (nearlyEqual(note.volume ?? 1, nextVolume) && nearlyEqual(note.pan ?? 0, nextPan)) return note
            trackNotesChanged = true
            trackNoteChanges += 1
            return { ...note, pan: nextPan, volume: nextVolume }
          })
          if (trackNotesChanged) notesChanged = true
          noteChangeCounts.set(track.id, trackNoteChanges)
          return [
            track.id,
            trackNotesChanged ? nextNotes : notes,
          ]
        }),
      )
      report = analyzedTracks.map(({ nextPan, nextVolume, role, track }) => ({
        afterPan: nextPan,
        afterVolume: nextVolume,
        beforeVolume: track.volume,
        noteChanges: noteChangeCounts.get(track.id) ?? 0,
        role,
        trackId: track.id,
      }))

      return nextTracks.every((track, index) => track === current.tracks[index]) && !notesChanged
        ? current
        : { ...current, tracks: nextTracks, notesByTrack: nextNotesByTrack }
    })
    setAutoMixReport(report)

    if (isPlaying) {
      const restartBeat = getCurrentPlaybackBeat()
      window.setTimeout(() => {
        void startPlaybackAt(restartBeat)
      }, 0)
    }
  }

  async function runAutoMixTracks() {
    if (isAutoMixing) return
    setIsAutoMixing(true)
    setAutoMixPanelOpen(false)
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 120))
      autoMixTracks()
      await new Promise((resolve) => window.setTimeout(resolve, 360))
    } finally {
      setIsAutoMixing(false)
    }
  }

  function createAutoMixSection(current: Project): AutoMixSection {
    const startBeat = Math.max(0, Math.floor(playbackBeat / BEATS_PER_BAR) * BEATS_PER_BAR)
    const projectEnd = Math.max(DEFAULT_PROJECT_LENGTH_BEATS, getNotesEndBeat(current.notesByTrack))
    const endBeat = Math.min(projectEnd + BEATS_PER_BAR, startBeat + BEATS_PER_BAR * 4)

    return {
      id: createId('automix'),
      name: `구간 ${(current.autoMixSections?.length ?? 0) + 1}`,
      startBeat,
      endBeat: Math.max(startBeat + BEATS_PER_BAR, endBeat),
      intensity: 0.7,
      priorities: Object.fromEntries(
        current.tracks.map((track) => [track.id, getDefaultAutoMixPriority(track)]),
      ),
    }
  }

  function addAutoMixSection() {
    setAutoMixPanelOpen(true)
    setProject((current) => ({
      ...current,
      autoMixSections: [...(current.autoMixSections ?? []), createAutoMixSection(current)],
    }))
  }

  function updateAutoMixSection(sectionId: string, updates: Partial<AutoMixSection>) {
    setProject((current) => ({
      ...current,
      autoMixSections: (current.autoMixSections ?? []).map((section) => (
        section.id === sectionId
          ? {
              ...section,
              ...updates,
              endBeat: Math.max(
                (updates.startBeat ?? section.startBeat) + 0.25,
                updates.endBeat ?? section.endBeat,
              ),
            }
          : section
      )),
    }))
  }

  function setAutoMixFocusTrack(sectionId: string, trackId: string) {
    setProject((current) => ({
      ...current,
      autoMixSections: (current.autoMixSections ?? []).map((section) => (
        section.id === sectionId
          ? {
              ...section,
              priorities: Object.fromEntries(
                current.tracks.map((track) => [
                  track.id,
                  track.id === trackId ? 5 : getDefaultAutoMixPriority(track),
                ]),
              ),
            }
          : section
      )),
    }))
  }

  function deleteAutoMixSection(sectionId: string) {
    setProject((current) => ({
      ...current,
      autoMixSections: (current.autoMixSections ?? []).filter((section) => section.id !== sectionId),
    }))
  }

  function openProjectFile() {
    fileInputRef.current?.click()
    setFileMenuOpen(false)
  }

  function loadProjectFromFile(file: File) {
    const isMidi = file.name.toLowerCase().endsWith('.mid') || file.name.toLowerCase().endsWith('.midi')
    const reader = new FileReader()
    reader.onload = () => {
      try {
        resetPlayback()
        setSelectedNoteIds([])
        if (isMidi) {
          const buffer = reader.result
          if (!(buffer instanceof ArrayBuffer)) throw new Error('Invalid MIDI data')
          setProject(normalizeProject(importMidiProject(buffer, file.name.replace(/\.[^.]+$/, ''))))
        } else {
          const nextProject = normalizeProject(JSON.parse(String(reader.result)) as Project)
          setProject(nextProject)
        }
      } catch {
        alert('파일을 불러오지 못했습니다. 비기너뮤직 프로젝트 파일 또는 미디 파일인지 확인해 주세요.')
      }
    }

    if (isMidi) {
      reader.readAsArrayBuffer(file)
    } else {
      reader.readAsText(file)
    }
  }

  function loadProjectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    loadProjectFromFile(file)
    event.target.value = ''
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return
    event.preventDefault()
    setIsDraggingFile(true)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDraggingFile(false)
    const files = Array.from(event.dataTransfer.files)
    const projectFile = files.find((file) => /\.(json|beg|beginner-music|mid|midi)$/i.test(file.name))
    if (projectFile) {
      loadProjectFromFile(projectFile)
      return
    }

    void Promise.all(files.filter((file) => file.type.startsWith('audio/')).map((file) => addAudioFileAsTrack(file)))
  }

  function setPlaybackPosition(beat: number) {
    const nextBeat = Math.max(0, Math.min(totalBeats, beat))
    playbackBeatRef.current = nextBeat
    setPlaybackBeat(nextBeat)
    pianoRollRef.current?.style.setProperty(
      '--playhead-left',
      `${Math.min(100, (nextBeat / totalBeats) * 100)}%`,
    )
  }

  function keepPlayheadInView(beat: number) {
    const roll = pianoRollRef.current
    if (!roll || totalBeats <= 0) return

    const gridWidth = Math.max(totalSteps * stepWidth, roll.scrollWidth - KEY_COLUMN_WIDTH)
    const playheadX = KEY_COLUMN_WIDTH + (beat / totalBeats) * gridWidth
    const viewportLeft = roll.scrollLeft
    const viewportRight = viewportLeft + roll.clientWidth
    const rightEdge = viewportRight - PLAYHEAD_SCROLL_PADDING
    const leftEdge = viewportLeft + KEY_COLUMN_WIDTH + PLAYHEAD_SCROLL_PADDING

    if (playheadX > rightEdge) {
      roll.scrollLeft = Math.min(
        roll.scrollWidth - roll.clientWidth,
        playheadX - roll.clientWidth + PLAYHEAD_SCROLL_PADDING,
      )
      return
    }

    if (playheadX < leftEdge) {
      roll.scrollLeft = Math.max(0, playheadX - KEY_COLUMN_WIDTH - PLAYHEAD_SCROLL_PADDING)
    }
  }

  function seekPlayback(beat: number) {
    setPlaybackPosition(beat)
    keepPlayheadInView(beat)
    if (isPlaying) {
      void startPlaybackAt(beat)
    }
  }

  function seekPlaybackFromTimeline(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return

    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width)
    seekPlayback((x / rect.width) * totalBeats)
  }

  function changeTempoFromGraph(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return

    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height)
    const ratio = 1 - y / rect.height
    const nextTempo = Math.round(TEMPO_GRAPH_MIN + ratio * (TEMPO_GRAPH_MAX - TEMPO_GRAPH_MIN))
    updateTempo(nextTempo)
  }

  function zoomRoll(direction: -1 | 1) {
    setRollZoom((current) => getNextZoom(current, direction))
  }

  function disposePlaybackVoices() {
    playbackSessionRef.current += 1
    activeTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
    activeTimeoutsRef.current = []
    activeIntervalsRef.current.forEach((intervalId) => window.clearInterval(intervalId))
    activeIntervalsRef.current = []
    activeAudioElementsRef.current.forEach((audio) => {
      audio.pause()
      audio.src = ''
    })
    activeAudioElementsRef.current = []
    activeAudioNodesRef.current.forEach(({ gain, panner, source }) => {
      try {
        source.stop()
      } catch {
        // Source may have already ended naturally.
      }
      source.disconnect()
      gain.disconnect()
      panner.disconnect()
    })
    activeAudioNodesRef.current = []
    activeInstrumentsRef.current.forEach((instrument) => {
      instrument.triggerRelease(undefined)
      instrument.dispose()
    })
    activeInstrumentsRef.current = []
    activePlaybackTracksRef.current = []
    setIsPlaying(false)
  }

  function schedulePlaybackNote(
    track: ActivePlaybackTrack,
    note: Note,
    currentBeat: number,
    sessionId: number,
  ) {
    const beatSeconds = 60 / projectRef.current.tempo
    const offsetBeat = Math.max(0, currentBeat - note.startBeat)
    const remainingDurationSeconds = Math.max(0.04, (note.durationBeats - offsetBeat) * beatSeconds)
    const delayMs = Math.max(0, (note.startBeat - currentBeat) * beatSeconds * 1000)
    const noteInput = track.instrument.expectsMidi
      ? note.pitch
      : Tone.Frequency(note.pitch, 'midi').toFrequency()

    const startTimeoutId = window.setTimeout(() => {
      if (sessionId !== playbackSessionRef.current) return

      if (track.isDrum) {
        track.instrument.triggerAttackRelease(
          noteInput,
          getMinimumPlaybackDrumSeconds(note.pitch, remainingDurationSeconds),
          Tone.now(),
          note.velocity,
        )
        return
      }

      track.instrument.triggerAttackRelease(
        noteInput,
        remainingDurationSeconds,
        Tone.now(),
        note.velocity,
      )
    }, Math.ceil(delayMs))

    activeTimeoutsRef.current.push(startTimeoutId)
  }

  function getMinimumPlaybackDrumSeconds(pitch: number, durationSeconds: number) {
    if (pitch === 35 || pitch === 36) return Math.max(durationSeconds, 0.32)
    if (pitch === 38 || pitch === 39 || pitch === 40) return Math.max(durationSeconds, 0.42)
    if (pitch === 42 || pitch === 44) return Math.max(durationSeconds, 0.18)
    if (pitch === 46) return Math.max(durationSeconds, 0.55)
    if (pitch >= 41 && pitch <= 50) return Math.max(durationSeconds, 0.44)
    if (pitch === 49 || pitch === 51 || pitch === 52 || pitch === 55 || pitch === 57 || pitch === 59) {
      return Math.max(durationSeconds, 0.9)
    }
    if (pitch >= 65 && pitch <= 81) return Math.max(durationSeconds, 0.36)
    return Math.max(durationSeconds, 0.28)
  }

  function schedulePlaybackWindow(currentBeat: number) {
    const windowEndBeat = currentBeat + PLAYBACK_LOOKAHEAD_BEATS
    const sessionId = playbackSessionRef.current

    activePlaybackTracksRef.current.forEach((track) => {
      const notesToSchedule: Note[] = []

      while (track.nextIndex < track.notes.length) {
        const note = track.notes[track.nextIndex]
        if (note.startBeat >= windowEndBeat) break

        if (note.startBeat + note.durationBeats > currentBeat) {
          notesToSchedule.push(note)
        }

        track.nextIndex += 1
      }

      if (notesToSchedule.length === 0) return

      notesToSchedule.forEach((note) => {
        schedulePlaybackNote(track, note, currentBeat, sessionId)
      })
    })
  }

  function schedulePlaybackAudioClips(currentProject: Project, startBeat: number, sessionId: number) {
    const beatSeconds = 60 / currentProject.tempo

    ;(currentProject.audioClips ?? []).forEach((clip) => {
      const track = currentProject.tracks.find((item) => item.id === clip.trackId)
      if (!track || track.mute) return
      if (clip.startBeat + clip.durationBeats <= startBeat) return

      const clipOffsetSeconds = Math.max(0, (startBeat - clip.startBeat) * beatSeconds)
      const delayMs = Math.max(0, (clip.startBeat - startBeat) * beatSeconds * 1000)
      const timeoutId = window.setTimeout(() => {
        if (sessionId !== playbackSessionRef.current) return
        const context = Tone.getContext().rawContext
        void fetch(clip.dataUrl)
          .then((response) => response.arrayBuffer())
          .then((arrayBuffer) => context.decodeAudioData(arrayBuffer))
          .then((buffer) => {
            if (sessionId !== playbackSessionRef.current) return
            const source = context.createBufferSource()
            const gain = context.createGain()
            const panner = context.createStereoPanner()
            const playDurationSeconds = Math.min(buffer.duration - clipOffsetSeconds, clip.durationBeats * beatSeconds - clipOffsetSeconds)
            if (playDurationSeconds <= 0) return

            source.buffer = buffer
            gain.gain.setValueAtTime(Math.max(0, Math.min(1.8, clip.volume * track.volume)), context.currentTime)
            panner.pan.setValueAtTime(Math.max(-1, Math.min(1, clip.pan + (track.pan ?? 0))), context.currentTime)
            source.connect(gain)
            gain.connect(panner)
            panner.connect(context.destination)
            activeAudioNodesRef.current.push({ gain, panner, source })
            source.onended = () => {
              source.disconnect()
              gain.disconnect()
              panner.disconnect()
              activeAudioNodesRef.current = activeAudioNodesRef.current.filter((node) => node.source !== source)
            }
            source.start(context.currentTime, clipOffsetSeconds, playDurationSeconds)
          })
          .catch(() => undefined)
      }, Math.ceil(delayMs))
      activeTimeoutsRef.current.push(timeoutId)
    })
  }

  function getLivePlaybackBeat() {
    const elapsedMs = performance.now() - playbackStartMsRef.current
    const elapsedBeat = elapsedMs / 1000 / (60 / projectRef.current.tempo)
    return Math.min(totalBeats, playbackStartBeatRef.current + elapsedBeat)
  }

  function getCurrentPlaybackBeat() {
    if (!isPlaying) return playbackBeatRef.current
    return getLivePlaybackBeat()
  }

  function pausePlayback() {
    const currentBeat = getCurrentPlaybackBeat()
    playbackBeatRef.current = currentBeat
    setPlaybackBeat(currentBeat)
    disposePlaybackVoices()
  }

  function resetPlayback() {
    disposePlaybackVoices()
    setPlaybackPosition(0)
  }

  async function startPlaybackAt(startBeat: number) {
    disposePlaybackVoices()
    const sessionId = playbackSessionRef.current
    await ensureAudioReady()
    if (sessionId !== playbackSessionRef.current) return

    const safeStartBeat = Math.max(0, Math.min(totalBeats, startBeat))
    const currentProject = projectRef.current

    currentProject.tracks.forEach((track) => {
      if (track.mute) return

      const notes = (currentProject.notesByTrack[track.id] ?? [])
        .map((note) => ({
          ...note,
          pitch: note.pitch + (note.pitchBend ?? 0),
          velocity: note.velocity * (note.volume ?? 1) * (note.expression ?? 1) * track.volume,
        }))
        .sort((left, right) => left.startBeat - right.startBeat)

      if (notes.length === 0) return

      const instrument = createInstrument(track.instrumentId)
      activeInstrumentsRef.current.push(instrument)
      activePlaybackTracksRef.current.push({
        activeFrequencies: new Map(),
        id: track.id,
        instrument,
        isDrum: isDrumInstrument(track.instrumentId),
        notes,
        nextIndex: notes.findIndex((note) => note.startBeat + note.durationBeats > safeStartBeat),
      })
    })

    await Promise.all(
      activePlaybackTracksRef.current.map((track) =>
        waitForInstrumentReady(track.instrument),
      ),
    )
    if (sessionId !== playbackSessionRef.current) return

    activePlaybackTracksRef.current.forEach((track) => {
      if (track.nextIndex < 0) track.nextIndex = track.notes.length
    })

    if (activePlaybackTracksRef.current.length === 0) {
      setPlaybackPosition(safeStartBeat)
    }

    playbackStartBeatRef.current = safeStartBeat
    playbackStartMsRef.current = performance.now()
    setPlaybackPosition(safeStartBeat)
    setIsPlaying(true)
    schedulePlaybackAudioClips(currentProject, safeStartBeat, sessionId)
    schedulePlaybackWindow(safeStartBeat)
    activeIntervalsRef.current.push(
      window.setInterval(() => {
        schedulePlaybackWindow(getLivePlaybackBeat())
      }, PLAYBACK_SCHEDULER_MS),
    )
    activeTimeoutsRef.current.push(
      window.setTimeout(
        resetPlayback,
        Math.ceil(((totalBeats - safeStartBeat) * 60 * 1000) / currentProject.tempo) + 2200,
      ),
    )
  }

  async function startPlayback() {
    const startBeat = playbackBeatRef.current >= totalBeats ? 0 : playbackBeatRef.current
    await startPlaybackAt(startBeat)
  }

  function togglePlayback() {
    if (isPlaying) {
      pausePlayback()
      return
    }

    void startPlayback()
  }

  return (
    <div
      className="app-shell"
      data-dragging-file={isDraggingFile}
      data-theme={project.theme}
      data-tool={toolMode}
      onDragLeave={() => setIsDraggingFile(false)}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onPointerDown={() => {
        closeTrackContextMenu()
        closePianoRollContextMenu()
      }}
    >
      <header className="top-bar">
        <nav className="main-menu" aria-label="상단 메뉴">
          <div className="file-menu-wrap">
            <button
              type="button"
              onPointerDown={(event) => {
                event.preventDefault()
                setEditMenuOpen(false)
                setFileMenuOpen((current) => !current)
              }}
            >
              <span>파일</span><span className="menu-chevron">⌄</span>
            </button>
            {fileMenuOpen ? (
              <div className="file-menu">
                <button type="button" onPointerDown={createNewProject}>새 프로젝트</button>
                <button type="button" onPointerDown={openProjectFile}>불러오기</button>
                <button type="button" onPointerDown={saveProjectFile}>프로젝트 저장</button>
                <button type="button" disabled={isExportingMp3} onPointerDown={saveMp3File}>
                  {isExportingMp3 ? '음악 파일 만드는 중...' : '음악 파일 저장'}
                </button>
                <button type="button" onPointerDown={saveMidiFile}>미디 파일 저장</button>
              </div>
            ) : null}
          </div>
          <div className="file-menu-wrap">
            <button
              type="button"
              onPointerDown={(event) => {
                event.preventDefault()
                setFileMenuOpen(false)
                setEditMenuOpen((current) => !current)
              }}
            >
              <span>편집</span><span className="menu-chevron">⌄</span>
            </button>
            {editMenuOpen ? (
              <div className="file-menu">
                <button type="button" disabled={undoStackRef.current.length === 0} onPointerDown={undoProject}>
                  되돌리기
                </button>
                <button type="button" disabled={redoStackRef.current.length === 0} onPointerDown={redoProject}>
                  다시 실행
                </button>
                <button type="button" disabled={selectedPatternNotes.length === 0} onPointerDown={copySelectedNotes}>
                  복사
                </button>
                <button type="button" disabled={selectedPatternNotes.length === 0} onPointerDown={cutSelectedNotes}>
                  잘라내기
                </button>
                <button type="button" disabled={!patternClipboardRef.current} onPointerDown={pasteSelectedNotes}>
                  붙여넣기
                </button>
                <button type="button" disabled={selectedPatternNotes.length === 0} onPointerDown={duplicateSelectedNotes}>
                  복제
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className={activeEditorTab === 'piano-roll' ? 'is-active' : ''}
            onPointerDown={() => setActiveEditorTab('piano-roll')}
          >
            ▥ 멜로디 입력
          </button>
          <button
            type="button"
            className={activeEditorTab === 'arrange' ? 'is-active' : ''}
            onPointerDown={() => setActiveEditorTab('arrange')}
          >
            ▤ 배치
          </button>
          <button
            type="button"
            className={activeEditorTab === 'tempo' ? 'is-active' : ''}
            onPointerDown={() => setActiveEditorTab('tempo')}
          >
            ◷ 빠르기
          </button>
          <button
            type="button"
            className={activeEditorTab === 'automix' ? 'is-active' : ''}
            onPointerDown={() => {
              setActiveEditorTab('automix')
              setAutoMixPanelOpen(true)
            }}
          >
            ⧉ 믹스 우선순위
          </button>
        </nav>

        <input
          aria-label="프로젝트 이름"
          className="project-title-input"
          value={project.title}
          onChange={(event) => updateProjectTitle(event.target.value)}
        />

        <nav className="top-actions" aria-label="상단 작업">
          <button type="button" className="future-button" title="추후 설정 화면으로 연결 예정">설정</button>
          <button type="button" className="future-button" title="추후 도움말로 연결 예정">도움말</button>
          <button type="button" className="future-button" title="추후 로그인으로 연결 예정">로그인</button>
        </nav>

        <input
          ref={fileInputRef}
          className="hidden-file-input"
          type="file"
          accept="application/json,.json,.beginner-music.json,.mid,.midi,audio/midi"
          onChange={loadProjectFile}
        />
        <input
          ref={audioFileInputRef}
          className="hidden-file-input"
          type="file"
          accept="audio/*"
          multiple
          onChange={importAudioFiles}
        />
      </header>

      {isDraggingFile ? (
        <div className="drop-overlay" aria-hidden="true">
          프로젝트, MIDI, 오디오 파일을 놓으면 바로 불러옵니다
        </div>
      ) : null}

      {isAutoMixing ? (
        <div className="busy-overlay" role="status" aria-live="polite">
          <strong>자동 믹스 중</strong>
          <span>트랙 음량과 구간별 소리 세기를 맞추고 있습니다.</span>
        </div>
      ) : null}

      {instrumentDialogTrack ? (
        <div className="instrument-dialog-backdrop" onPointerDown={closeInstrumentDialog}>
          <section
            className="instrument-dialog"
            aria-label="악기 선택"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="instrument-picker-grid">
              <div className="instrument-column">
                <span className="instrument-column-title">악기 종류</span>
                <div className="instrument-category-list">
                  {instrumentCategories.map((category) => (
                    <button
                      type="button"
                      className={instrumentCategory === category ? 'is-active' : ''}
                      key={category}
                      onPointerDown={() => setInstrumentCategory(category)}
                    >
                      <img
                        alt=""
                        draggable={false}
                        src={getInstrumentImage(INSTRUMENT_CATEGORY_IMAGES[category] ?? 'gm-0')}
                      />
                      {getCategoryLabel(category)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="instrument-column">
                <span className="instrument-column-title">악기</span>
                <div className="instrument-choice-list">
                  {categoryInstruments.map((instrument) => (
                    <button
                      type="button"
                      className={selectedInstrumentId === instrument.id ? 'is-active' : ''}
                      key={instrument.id}
                      onPointerDown={() => previewInstrumentChoice(instrument.id)}
                    >
                      <img
                        alt=""
                        draggable={false}
                        src={getInstrumentImage(instrument.id)}
                      />
                      <span>{instrument.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="instrument-dialog-footer">
              <label className="rhythm-toggle">
                <input
                  checked={isDrumInstrument(selectedInstrumentId)}
                  type="checkbox"
                  onChange={(event) => {
                    if (event.target.checked) {
                      setInstrumentCategory('Drums')
                      previewInstrumentChoice('drums')
                      return
                    }

                    setInstrumentCategory('Piano')
                    previewInstrumentChoice('gm-0')
                  }}
                />
                리듬 트랙
              </label>

              <div className="instrument-dialog-actions">
                <button type="button" onPointerDown={closeInstrumentDialog}>취소</button>
                <button type="button" className="primary-action" onPointerDown={confirmInstrumentDialog}>
                  확인
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {trackContextMenu ? (
        <div
          className="track-context-menu"
          style={{ left: trackContextMenu.x, top: trackContextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onPointerDown={() => {
              addTrack()
              closeTrackContextMenu()
            }}
          >
            트랙 추가
          </button>
          <button
            type="button"
            disabled={project.tracks.length <= 1}
            onPointerDown={() => {
              deleteTrack(trackContextMenu.trackId)
              closeTrackContextMenu()
            }}
          >
            트랙 삭제
          </button>
          <button
            type="button"
            onPointerDown={() => {
              const track = project.tracks.find((item) => item.id === trackContextMenu.trackId)
              if (track) openInstrumentDialog(track)
              closeTrackContextMenu()
            }}
          >
            속성
          </button>
          <button
            type="button"
            onPointerDown={() => {
              cycleTrackColor(trackContextMenu.trackId)
              closeTrackContextMenu()
            }}
          >
            트랙 색상 변경
          </button>
        </div>
      ) : null}

      {pianoRollContextMenu ? (
        <div
          className="track-context-menu piano-roll-context-menu"
          style={{ left: pianoRollContextMenu.x, top: pianoRollContextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            disabled={undoStackRef.current.length === 0}
            onPointerDown={() => {
              undoProject()
              closePianoRollContextMenu()
            }}
          >
            실행 취소
          </button>
          <button
            type="button"
            disabled={redoStackRef.current.length === 0}
            onPointerDown={() => {
              redoProject()
              closePianoRollContextMenu()
            }}
          >
            다시 실행
          </button>
          <button
            type="button"
            disabled={selectedPatternNotes.length === 0}
            onPointerDown={() => {
              copySelectedNotes()
              closePianoRollContextMenu()
            }}
          >
            복사
          </button>
          <button
            type="button"
            disabled={selectedPatternNotes.length === 0}
            onPointerDown={() => {
              cutSelectedNotes()
              closePianoRollContextMenu()
            }}
          >
            잘라내기
          </button>
          <button
            type="button"
            disabled={!patternClipboardRef.current}
            onPointerDown={() => {
              pasteSelectedNotes()
              closePianoRollContextMenu()
            }}
          >
            붙여넣기
          </button>
          <button
            type="button"
            disabled={selectedPatternNotes.length === 0}
            onPointerDown={() => {
              deleteSelectedNote()
              closePianoRollContextMenu()
            }}
          >
            삭제
          </button>
        </div>
      ) : null}

      <main className="editor-shell">
        <aside className="track-panel" aria-label="트랙 목록" onContextMenu={openTrackPanelContextMenu}>
          <div className="track-toolbar">
            <button type="button" className="back-button">‹</button>
            <strong>{selectedTrack?.name ?? '트랙 1'}</strong>
            <button type="button" className="menu-button">☰</button>
          </div>

          <div className="track-list" onContextMenu={openTrackPanelContextMenu}>
            {project.tracks.map((track, index) => (
              <article
                className={track.id === project.selectedTrackId ? 'track-item is-selected' : 'track-item'}
                key={track.id}
                onPointerDown={(event) => {
                  if (event.button !== 0) return
                  selectTrack(track.id)
                }}
                onContextMenu={(event) => openTrackContextMenu(track.id, event)}
                style={{ '--track-color': track.color ?? TRACK_COLORS[0] } as CSSProperties}
              >
                <button
                  type="button"
                  className="instrument-image"
                  aria-label={`${getInstrumentLabel(track.instrumentId)} 악기 변경`}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return
                    event.preventDefault()
                    event.stopPropagation()
                    openInstrumentDialog(track)
                  }}
                >
                  <img
                    alt=""
                    draggable={false}
                    src={getInstrumentImage(track.instrumentId)}
                  />
                </button>

                <div className="track-copy">
                  <strong>트랙 {index + 1}</strong>
                  <span>{getInstrumentLabel(track.instrumentId)}</span>
                </div>

                <div className="track-mix-readout" aria-label="믹스 상태">
                  <span className="track-volume-meter">
                    <span style={{ width: `${Math.round(Math.min(1, track.volume) * 100)}%` }} />
                  </span>
                  <small>
                    음량 {Math.round(track.volume * 100)}
                    {track.pan !== undefined && Math.abs(track.pan) > 0.01
                      ? ` · ${track.pan < 0 ? '왼쪽' : '오른쪽'} ${Math.round(Math.abs(track.pan) * 100)}`
                      : ' · 가운데'}
                  </small>
                </div>

                <label
                  className="track-volume-control"
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <span>음량</span>
                  <input
                    aria-label={`${track.name} 음량`}
                    type="range"
                    min="0"
                    max="1.2"
                    step="0.01"
                    value={track.volume}
                    onChange={(event) => updateTrack(track.id, { volume: Number(event.target.value) })}
                  />
                  <em>{Math.round(track.volume * 100)}</em>
                </label>

                <div className="mini-actions" aria-label="트랙 제어">
                  <button
                    type="button"
                    title="미리듣기"
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    ⌕
                  </button>
                  <button
                    type="button"
                    className={track.mute ? 'is-muted' : ''}
                    title="음소거"
                    onPointerDown={(event) => {
                      event.stopPropagation()
                      updateTrack(track.id, { mute: !track.mute })
                    }}
                  >
                    {track.mute ? '×' : '♪'}
                  </button>
                  <button
                    type="button"
                    title="레이어"
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    ◆
                  </button>
                  <select
                    aria-label="채널"
                    value={track.channel ?? index + 1}
                    onChange={(event) => updateTrack(track.id, { channel: Number(event.target.value) })}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    {Array.from({ length: 16 }, (_, channelIndex) => (
                      <option key={channelIndex + 1} value={channelIndex + 1}>
                        채널 {channelIndex + 1}
                      </option>
                    ))}
                  </select>
                </div>
              </article>
            ))}
            <button type="button" className="add-track-button" onPointerDown={addTrack}>＋ 트랙 추가</button>
            <div className="automix-panel">
              <div className="audio-actions">
                <button type="button" onPointerDown={openAudioUpload}>오디오 넣기</button>
                <button
                  type="button"
                  className={isRecordingVoice ? 'is-recording' : ''}
                  onPointerDown={() => void toggleVoiceRecording()}
                >
                  {isRecordingVoice ? '녹음 끝내기' : '음성 녹음'}
                </button>
              </div>
              <div className="automix-actions">
                <button type="button" className="automix-track-button" disabled={isAutoMixing} onPointerDown={() => void runAutoMixTracks()}>
                  <img alt="" draggable={false} src="/instrument-icons/fx.svg" />
                  <span>{isAutoMixing ? '믹스 중...' : '자동 믹스'}</span>
                </button>
                <button
                  type="button"
                  className={autoMixPanelOpen ? 'automix-toggle is-open' : 'automix-toggle'}
                  onPointerDown={() => setAutoMixPanelOpen((open) => !open)}
                >
                  우선순위
                </button>
              </div>

              {autoMixPanelOpen ? (
                <div className="automix-priority-panel" aria-label="자동 믹스 우선순위">
                  {autoMixReport.length > 0 ? (
                    <div className="automix-result-list">
                      {autoMixReport.map((item) => {
                        const track = project.tracks.find((currentTrack) => currentTrack.id === item.trackId)
                        if (!track) return null

                        return (
                          <div className="automix-result" key={item.trackId}>
                            <span>{track.name} · {item.role}</span>
                            <strong>{Math.round(item.beforeVolume * 100)} → {Math.round(item.afterVolume * 100)}</strong>
                          </div>
                        )
                      })}
                    </div>
                  ) : null}
                  <div className="automix-panel-head">
                    <strong>믹스 컷</strong>
                    <button type="button" onPointerDown={addAutoMixSection}>＋ 컷 추가</button>
                  </div>
                  {(project.autoMixSections ?? []).length === 0 ? (
                    <p>컷을 추가하고 그 구간에서 가장 중요한 트랙만 고르면 자동 믹스가 나머지를 알아서 뒤로 보냅니다.</p>
                  ) : (
                    (project.autoMixSections ?? []).map((section) => (
                      <article className="automix-section" key={section.id}>
                        <div className="automix-section-top">
                          <input
                            aria-label="구간 이름"
                            value={section.name}
                            onChange={(event) => updateAutoMixSection(section.id, { name: event.target.value })}
                          />
                          <button type="button" onPointerDown={() => deleteAutoMixSection(section.id)}>삭제</button>
                        </div>
                        <div className="automix-section-grid">
                          <label>
                            <span>시작</span>
                            <input
                              min={1}
                              step={0.25}
                              type="number"
                              value={Number((section.startBeat / BEATS_PER_BAR + 1).toFixed(2))}
                              onChange={(event) => {
                                const nextStart = Math.max(0, (Number(event.target.value) - 1) * BEATS_PER_BAR)
                                updateAutoMixSection(section.id, { startBeat: nextStart })
                              }}
                            />
                          </label>
                          <label>
                            <span>끝</span>
                            <input
                              min={1.25}
                              step={0.25}
                              type="number"
                              value={Number((section.endBeat / BEATS_PER_BAR + 1).toFixed(2))}
                              onChange={(event) => {
                                const nextEnd = Math.max(0.25, (Number(event.target.value) - 1) * BEATS_PER_BAR)
                                updateAutoMixSection(section.id, { endBeat: nextEnd })
                              }}
                            />
                          </label>
                          <label>
                            <span>강도 {Math.round(section.intensity * 100)}</span>
                            <input
                              max={1}
                              min={0}
                              step={0.05}
                              type="range"
                              value={section.intensity}
                              onChange={(event) => updateAutoMixSection(section.id, { intensity: Number(event.target.value) })}
                            />
                          </label>
                        </div>
                        <label className="automix-focus-select">
                          <span>이 구간 중심 트랙</span>
                          <select
                            value={getAutoMixFocusTrackId(section)}
                            onChange={(event) => setAutoMixFocusTrack(section.id, event.target.value)}
                          >
                            {project.tracks.map((track, index) => (
                              <option key={track.id} value={track.id}>
                                트랙 {index + 1} · {getInstrumentLabel(track.instrumentId)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="automix-cut-preview">
                          <span style={{ left: `${Math.min(100, Math.max(0, (section.startBeat / Math.max(1, totalBeats)) * 100))}%` }} />
                          <span style={{ left: `${Math.min(100, Math.max(0, (section.endBeat / Math.max(1, totalBeats)) * 100))}%` }} />
                        </div>
                      </article>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </aside>

        <section className="piano-roll-area" aria-label="피아노 롤">
          {activeEditorTab === 'piano-roll' ? (
            <>
          <div className="roll-header">
            <button
              type="button"
              className="instrument-pill"
              onPointerDown={(event) => {
                if (!selectedTrack || event.button !== 0) return
                event.preventDefault()
                openInstrumentDialog(selectedTrack)
              }}
            >
              {selectedTrack ? (
                <img
                  alt=""
                  draggable={false}
                  src={getInstrumentImage(selectedTrack.instrumentId)}
                />
              ) : (
                <span>{getInstrumentIcon('gm-0')}</span>
              )}
              {selectedTrack ? getInstrumentLabel(selectedTrack.instrumentId) : '피아노'}
            </button>
            <div className="roll-tools">
              <button
                type="button"
                className={toolMode === 'draw' ? 'is-active' : ''}
                onPointerDown={() => changeToolMode('draw')}
                title="그리기와 이동"
              >
                ✎
              </button>
              <button
                type="button"
                className={toolMode === 'erase' ? 'is-active' : ''}
                onPointerDown={() => changeToolMode('erase')}
                title="드래그 삭제"
              >
                ⌫
              </button>
              <button
                type="button"
                className={toolMode === 'select' ? 'is-active' : ''}
                onPointerDown={() => changeToolMode('select')}
                title="박스 선택"
              >
                ▣
              </button>
              <button
                type="button"
                className={toolMode === 'lasso' ? 'is-active' : ''}
                onPointerDown={() => changeToolMode('lasso')}
                title="자유 선택"
              >
                ⌁
              </button>
              <button
                type="button"
                className={keyboardInputEnabled ? 'is-active' : ''}
                onPointerDown={() => setKeyboardInputEnabled((current) => !current)}
                title="재생 중 A W S E D... 키로 실시간 입력"
              >
                ⌨ 키보드 입력
              </button>
              <div className="roll-zoom-controls" aria-label="피아노 롤 확대 축소">
                <button
                  type="button"
                  disabled={rollZoom === ROLL_ZOOM_LEVELS[0]}
                  onPointerDown={() => zoomRoll(-1)}
                  title="피아노 롤 축소"
                >
                  −
                </button>
                <span>{Math.round(rollZoom * 100)}%</span>
                <button
                  type="button"
                  disabled={rollZoom === ROLL_ZOOM_LEVELS[ROLL_ZOOM_LEVELS.length - 1]}
                  onPointerDown={() => zoomRoll(1)}
                  title="피아노 롤 확대"
                >
                  ＋
                </button>
              </div>
              <div className="division-buttons" aria-label="음표 단위">
                {NOTE_DIVISIONS.map((division) => (
                  <button
                    type="button"
                    className={noteDivision === division ? 'is-active' : ''}
                    key={division}
                    onPointerDown={() => setNoteDivision(division)}
                    title={`${division}분음표`}
                  >
                    <img
                      alt=""
                      aria-hidden="true"
                      draggable={false}
                      src={`/note-icons/note-${division}.svg`}
                    />
                    <small>{division}</small>
                  </button>
                ))}
              </div>
              <span>{visibleBars}</span>
            </div>
          </div>

          {selectedTrackIsAudio ? (
            <div className="audio-track-editor" style={rollSurfaceStyle}>
              <header>
                <strong>{selectedTrack?.name ?? '오디오 트랙'}</strong>
                <span>파형 높이를 위아래로 드래그하면 이 오디오 트랙의 볼륨이 바뀝니다.</span>
              </header>
              {selectedAudioClip ? (
                <div
                  className="audio-waveform-editor"
                  onPointerDown={(event) => adjustAudioClipVolumeFromPointer(selectedAudioClip, event)}
                  role="slider"
                  aria-label="오디오 볼륨"
                  aria-valuemin={0}
                  aria-valuemax={150}
                  aria-valuenow={Math.round(selectedAudioClip.volume * 100)}
                  tabIndex={0}
                >
                  <div className="audio-waveform-bars">
                    {(selectedAudioClip.waveform?.length ? selectedAudioClip.waveform : Array.from({ length: 96 }, () => 0.25)).map((peak, index) => (
                      <span
                        key={index}
                        style={{ height: `${Math.max(8, Math.min(100, peak * selectedAudioClip.volume * 100))}%` }}
                      />
                    ))}
                  </div>
                  <div className="audio-waveform-info">
                    <strong>{selectedAudioClip.name}</strong>
                    <span>볼륨 {Math.round(selectedAudioClip.volume * 100)}</span>
                  </div>
                </div>
              ) : (
                <div className="audio-track-empty">
                  <strong>오디오 파일이 없습니다</strong>
                  <span>오디오 넣기를 누르면 새 오디오 트랙이 만들어집니다.</span>
                </div>
              )}
            </div>
          ) : (
          <div
            className="piano-roll"
            ref={pianoRollRef}
            style={rollShellStyle}
          >
            <div className="corner-cell"> </div>
            <div
              className="measure-row"
              style={rollTimelineStyle}
              onPointerDown={seekPlaybackFromTimeline}
            >
              <span className="timeline-seek-fill" aria-hidden="true" />
              <span className="timeline-seek-handle" aria-hidden="true" />
              {Array.from({ length: visibleBars }, (_, bar) => (
                <div className="measure-cell" key={bar}>
                  {bar + 1}
                </div>
              ))}
            </div>
            <div className="roll-grid-guides" aria-hidden="true" />
            <div className="roll-playhead-layer" aria-hidden="true">
              <span className="roll-playhead" />
            </div>
            {selectionBox ? (
              <span
                className={selectionBox.selecting ? 'pattern-selection-box is-selecting' : 'pattern-selection-box'}
                style={{
                  height: `${selectionBox.height}px`,
                  left: `${selectionBox.left}px`,
                  top: `${selectionBox.top}px`,
                  width: `${selectionBox.width}px`,
                }}
                onPointerDown={beginSelectionBoxMove}
                aria-label="선택 영역 이동"
              >
                <span
                  className="pattern-repeat-handle"
                  onPointerDown={beginPatternRepeat}
                  title="오른쪽으로 늘려 패턴 반복"
                />
              </span>
            ) : null}

            {lassoPoints.length > 1 ? (
              <svg
                className="lasso-overlay"
                style={{
                  height: `${ROLL_HEADER_HEIGHT + rollPitches.length * ROLL_ROW_HEIGHT}px`,
                  width: `${KEY_COLUMN_WIDTH + totalBeats * beatWidth}px`,
                }}
                aria-hidden="true"
              >
                <polygon
                  points={lassoPoints.map((point) => `${point.viewX},${point.viewY}`).join(' ')}
                />
                <polyline
                  points={lassoPoints.map((point) => `${point.viewX},${point.viewY}`).join(' ')}
                />
                {lassoPoints.map((point, index) => (
                  <circle cx={point.viewX} cy={point.viewY} key={index} r="2.2" />
                ))}
              </svg>
            ) : null}

            {rollPitches.map((pitch) => (
              <div className="roll-row" key={pitch}>
                <button
                  type="button"
                  className={`${selectedTrack && isDrumInstrument(selectedTrack.instrumentId) ? 'piano-key is-drum' : NOTE_NAMES[pitch % 12].includes('#') ? 'piano-key is-black' : 'piano-key'}${
                    pressedPitch === pitch ? ' is-pressed' : ''
                  }`}
                  onPointerDown={(event) => {
                    beginKeyPreview(pitch, event)
                  }}
                  onPointerEnter={() => continueKeyPreview(pitch)}
                >
                  {getRowLabel(pitch)}
                </button>
                <div
                  className="step-row"
                  onPointerDown={(event) => beginRowAction(pitch, event)}
                  onContextMenu={(event) => beginRowContextErase(pitch, event)}
                >
                  {(otherNotesByPitch.get(pitch) ?? []).map((note) => (
                      <span
                        className="note-block is-ghost"
                        key={`${note.trackId}-${note.id}`}
                        style={{
                          left: `${(note.startBeat / totalBeats) * 100}%`,
                          width: `${(note.durationBeats / totalBeats) * 100}%`,
                        }}
                        aria-hidden="true"
                      />
                    ))}

                  {(selectedNotesByPitch.get(pitch) ?? []).map((note) => {
                      const className = [
                        'note-block',
                        note.id === project.selectedNoteId || selectedNoteIdSet.has(note.id) ? 'is-selected' : '',
                        selectedNoteIdSet.has(note.id) && selectedNoteIds.length > 1 ? 'is-pattern-selected' : '',
                        draggingNoteId === note.id ? 'is-dragging' : '',
                        resizingNoteId === note.id ? 'is-resizing' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')

                      return (
                        <button
                          type="button"
                          className={className}
                          key={note.id}
                          style={{
                            left: `${(note.startBeat / totalBeats) * 100}%`,
                            width: `${(note.durationBeats / totalBeats) * 100}%`,
                          }}
                          onPointerDown={(event) => {
                            beginMoveNote(note, event)
                          }}
                          onPointerDownCapture={(event) => {
                            beginRightEraseNote(note, event)
                          }}
                          onContextMenu={(event) => {
                            event.preventDefault()
                          }}
                          aria-label={`${getNoteDisplayLabel(note)} 음표`}
                        >
                          <span className="note-label">{getNoteDisplayLabel(note)}</span>
                          <span
                            className="resize-handle"
                            onPointerDown={(event) => startResizingNote(note, event)}
                            aria-hidden="true"
                          />
                        </button>
                      )
                    })}
                </div>
              </div>
            ))}
          </div>
          )}
            </>
          ) : activeEditorTab === 'arrange' ? (
            <div className="arrange-view" aria-label="편곡 배치" style={rollSurfaceStyle}>
              <header>
                <strong>배치</strong>
                <span>트랙별로 전체 멜로디 배치를 확인합니다.</span>
              </header>
              <div className="arrange-timeline">
                {Array.from({ length: visibleBars }, (_, bar) => (
                  <span key={bar}>{bar + 1}</span>
                ))}
              </div>
              <div className="arrange-lanes">
                {project.tracks.map((track, index) => {
                  const notes = project.notesByTrack[track.id] ?? []
                  const clips = (project.audioClips ?? []).filter((clip) => clip.trackId === track.id)
                  return (
                    <div className="arrange-lane" key={track.id}>
                      <button
                        type="button"
                        className={track.id === project.selectedTrackId ? 'is-active' : ''}
                        onPointerDown={() => selectTrack(track.id)}
                      >
                        <img alt="" draggable={false} src={getInstrumentImage(track.instrumentId)} />
                        <span>트랙 {index + 1}</span>
                      </button>
                      <div className="arrange-lane-grid">
                        {notes.map((note) => (
                          <span
                            className="arrange-note"
                            key={note.id}
                            style={{
                              left: `${(note.startBeat / totalBeats) * 100}%`,
                              width: `${(note.durationBeats / totalBeats) * 100}%`,
                            }}
                          />
                        ))}
                        {clips.map((clip) => (
                          <span
                            className="arrange-audio-clip"
                            key={clip.id}
                            title={clip.name}
                            style={{
                              left: `${(clip.startBeat / totalBeats) * 100}%`,
                              width: `${(clip.durationBeats / totalBeats) * 100}%`,
                            }}
                          >
                            <span className="arrange-audio-waveform" aria-hidden="true">
                              {(clip.waveform?.length ? clip.waveform : Array.from({ length: 32 }, () => 0.28)).slice(0, 48).map((peak, barIndex) => (
                                <i
                                  key={barIndex}
                                  style={{ height: `${Math.max(12, Math.min(100, peak * clip.volume * 100))}%` }}
                                />
                              ))}
                            </span>
                            <em>{clip.name}</em>
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : activeEditorTab === 'tempo' ? (
            <div className="tempo-view" aria-label="템포 편집" style={rollSurfaceStyle}>
              <header>
                <strong>빠르기</strong>
                <span>그래프를 클릭해서 현재 프로젝트 빠르기를 조절합니다.</span>
              </header>
              <div className="tempo-graph" onPointerDown={changeTempoFromGraph}>
                <span className="tempo-graph-min">{TEMPO_GRAPH_MIN}</span>
                <span className="tempo-graph-max">{TEMPO_GRAPH_MAX}</span>
                <span
                  className="tempo-graph-fill"
                  style={{ height: `${tempoGraphPercent}%` }}
                />
                <span
                  className="tempo-graph-handle"
                  style={{ bottom: `${tempoGraphPercent}%` }}
                >
                  {project.tempo} 빠르기
                </span>
              </div>
              <div className="tempo-view-controls">
                <button type="button" onPointerDown={() => updateTempo(project.tempo - 1)}>−</button>
                <input
                  aria-label="빠르기"
                  inputMode="numeric"
                  type="text"
                  value={tempoInput}
                  onBlur={commitTempoInput}
                  onChange={(event) => changeTempoInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                  }}
                />
                <button type="button" onPointerDown={() => updateTempo(project.tempo + 1)}>＋</button>
              </div>
            </div>
          ) : (
            <div className="automix-view" aria-label="믹스 우선순위">
              <header>
                <strong>믹스 우선순위</strong>
                <span>컷을 나누고 구간마다 중심 트랙을 고르면 자동 믹스가 적용됩니다.</span>
              </header>
              <div className="automix-view-actions">
                <button type="button" onPointerDown={addAutoMixSection}>＋ 컷 추가</button>
                <button type="button" disabled={isAutoMixing} onPointerDown={() => void runAutoMixTracks()}>
                  {isAutoMixing ? '자동 믹스 중...' : '자동 믹스 적용'}
                </button>
              </div>
              <div className="automix-explain">
                <strong>자동 믹스는 트랙 음량, 구간별 음표 음량, 좌우 위치를 조정합니다.</strong>
                <span>드럼과 베이스는 곡의 중심을 잡고, 멜로디는 앞으로, 배경 악기는 살짝 뒤로 보냅니다.</span>
              </div>
              {autoMixReport.length > 0 ? (
                <div className="automix-report-grid">
                  {autoMixReport.map((item) => {
                    const track = project.tracks.find((currentTrack) => currentTrack.id === item.trackId)
                    if (!track) return null

                    return (
                      <article className="automix-report-card" key={item.trackId}>
                        <span>{track.name}</span>
                        <strong>{item.role}</strong>
                        <div className="report-meter">
                          <span style={{ width: `${Math.round(item.afterVolume * 100)}%` }} />
                        </div>
                        <em>
                          음량 {Math.round(item.beforeVolume * 100)} → {Math.round(item.afterVolume * 100)}
                          {' · '}
                          {item.afterPan < -0.01 ? `왼쪽 ${Math.round(Math.abs(item.afterPan) * 100)}` : item.afterPan > 0.01 ? `오른쪽 ${Math.round(item.afterPan * 100)}` : '가운데'}
                          {' · '}
                          음표 {item.noteChanges}개 보정
                        </em>
                      </article>
                    )
                  })}
                </div>
              ) : null}
              {(project.autoMixSections ?? []).length === 0 ? (
                <div className="automix-empty">
                  <strong>아직 정한 컷이 없습니다.</strong>
                  <span>이 상태에서 자동 믹스를 누르면 드럼과 베이스를 조금 앞에 두는 기본 우선순위가 적용됩니다.</span>
                </div>
              ) : (
                <div className="automix-view-list">
                  {(project.autoMixSections ?? []).map((section) => (
                    <article className="automix-section" key={section.id}>
                      <div className="automix-section-top">
                        <input
                          aria-label="구간 이름"
                          value={section.name}
                          onChange={(event) => updateAutoMixSection(section.id, { name: event.target.value })}
                        />
                        <button type="button" onPointerDown={() => deleteAutoMixSection(section.id)}>삭제</button>
                      </div>
                      <div className="automix-section-grid">
                        <label>
                          <span>시작 마디</span>
                          <input
                            min={1}
                            step={0.25}
                            type="number"
                            value={Number((section.startBeat / BEATS_PER_BAR + 1).toFixed(2))}
                            onChange={(event) => updateAutoMixSection(section.id, {
                              startBeat: Math.max(0, (Number(event.target.value) - 1) * BEATS_PER_BAR),
                            })}
                          />
                        </label>
                        <label>
                          <span>끝 마디</span>
                          <input
                            min={1.25}
                            step={0.25}
                            type="number"
                            value={Number((section.endBeat / BEATS_PER_BAR + 1).toFixed(2))}
                            onChange={(event) => updateAutoMixSection(section.id, {
                              endBeat: Math.max(0.25, (Number(event.target.value) - 1) * BEATS_PER_BAR),
                            })}
                          />
                        </label>
                        <label>
                          <span>강도 {Math.round(section.intensity * 100)}</span>
                          <input
                            max={1}
                            min={0}
                            step={0.05}
                            type="range"
                            value={section.intensity}
                            onChange={(event) => updateAutoMixSection(section.id, { intensity: Number(event.target.value) })}
                          />
                        </label>
                      </div>
                      <label className="automix-focus-select">
                        <span>중심 트랙</span>
                        <select
                          value={getAutoMixFocusTrackId(section)}
                          onChange={(event) => setAutoMixFocusTrack(section.id, event.target.value)}
                        >
                          {project.tracks.map((track, index) => (
                            <option key={track.id} value={track.id}>
                              트랙 {index + 1} · {getInstrumentLabel(track.instrumentId)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="detail-panel" aria-label="세부 편집">
          <div className="detail-tabs" aria-label="편집 탭">
            {TERMINOLOGY_HELP.map((item) => (
              <button
                className={activeDetailTerm === item.term ? 'is-active' : ''}
                key={item.term}
                onPointerDown={() => setActiveDetailTerm(item.term)}
                title={`${item.label}: ${item.description}`}
                type="button"
              >
                <span>{item.term}</span>
              </button>
            ))}
          </div>

          <div className="velocity-lane">
            <div className="tempo-panel" aria-label="템포 설정">
              <label>
                <span>빠르기</span>
                <button type="button" onPointerDown={() => updateTempo(project.tempo - 5)}>−</button>
                <input
                  aria-label="빠르기"
                  inputMode="numeric"
                  type="text"
                  value={tempoInput}
                  onBlur={commitTempoInput}
                  onChange={(event) => changeTempoInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.currentTarget.blur()
                    }
                  }}
                />
                <select
                  aria-label="템포 선택"
                  value={TEMPO_PRESETS.includes(project.tempo) ? project.tempo : 'custom'}
                  onChange={(event) => updateTempo(Number(event.target.value))}
                >
                  <option disabled value="custom">직접</option>
                  {TEMPO_PRESETS.map((tempo) => (
                    <option key={tempo} value={tempo}>
                      {tempo}
                    </option>
                  ))}
                </select>
                <button type="button" onPointerDown={() => updateTempo(project.tempo + 5)}>＋</button>
              </label>
            </div>

            <div className="note-control-panel">
              <strong>
                {editableSelectedNotes.length > 0
                  ? `${editableSelectedNotes.length}개 음표 편집`
                  : '음표를 선택하세요'}
              </strong>
              <label>
                <span>소리 세기</span>
                <input
                  type="range"
                  min="0.05"
                  max="1"
                  step="0.01"
                  disabled={editableSelectedNotes.length === 0}
                  value={getSelectedNoteValue('velocity')}
                  onChange={(event) => updateSelectedNotes({ velocity: Number(event.target.value) })}
                />
                <em>{Math.round(getSelectedNoteValue('velocity') * 100)}</em>
              </label>
              <label>
                <span>음량</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  disabled={editableSelectedNotes.length === 0}
                  value={getSelectedNoteValue('volume')}
                  onChange={(event) => updateSelectedNotes({ volume: Number(event.target.value) })}
                />
                <em>{Math.round(getSelectedNoteValue('volume') * 100)}</em>
              </label>
              <label>
                <span>좌우 위치</span>
                <input
                  type="range"
                  min="-1"
                  max="1"
                  step="0.01"
                  disabled={editableSelectedNotes.length === 0}
                  value={getSelectedNoteValue('pan')}
                  onChange={(event) => updateSelectedNotes({ pan: Number(event.target.value) })}
                />
                <em>{Math.round(getSelectedNoteValue('pan') * 100)}</em>
              </label>
              <label>
                <span>음높이 휘기</span>
                <input
                  type="range"
                  min="-2"
                  max="2"
                  step="0.1"
                  disabled={editableSelectedNotes.length === 0}
                  value={getSelectedNoteValue('pitchBend')}
                  onChange={(event) => updateSelectedNotes({ pitchBend: Number(event.target.value) })}
                />
                <em>{getSelectedNoteValue('pitchBend').toFixed(1)}</em>
              </label>
              <label>
                <span>연주 느낌</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  disabled={editableSelectedNotes.length === 0}
                  value={getSelectedNoteValue('expression')}
                  onChange={(event) => updateSelectedNotes({ expression: Number(event.target.value) })}
                />
                <em>{Math.round(getSelectedNoteValue('expression') * 100)}</em>
              </label>
              <label>
                <span>떨림</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  disabled={editableSelectedNotes.length === 0}
                  value={getSelectedNoteValue('modulation')}
                  onChange={(event) => updateSelectedNotes({ modulation: Number(event.target.value) })}
                />
                <em>{Math.round(getSelectedNoteValue('modulation') * 100)}</em>
              </label>
            </div>

            {activeDetailTerm === '음표 정보' ? (
              <div className="event-editor">
                <strong>음표 정보</strong>
                {sortedEditableSelectedNotes.length === 0 ? (
                  <span>편집할 음표를 선택하세요.</span>
                ) : (
                  <div className="event-grid">
                    <span>음</span>
                    <span>시작</span>
                    <span>길이</span>
                    <span>세기</span>
                    {sortedEditableSelectedNotes.slice(0, 12).map((note) => (
                      <div className="event-row" key={note.id}>
                        <input
                          aria-label="음높이"
                          type="number"
                          value={note.pitch}
                          onChange={(event) => updateNoteEvent(note.id, { pitch: Number(event.target.value) })}
                        />
                        <input
                          aria-label="시작 박자"
                          step="0.125"
                          type="number"
                          value={Number(note.startBeat.toFixed(3))}
                          onChange={(event) => updateNoteEvent(note.id, { startBeat: snapBeatToGrid(Number(event.target.value)) })}
                        />
                        <input
                          aria-label="길이"
                          step="0.125"
                          type="number"
                          value={Number(note.durationBeats.toFixed(3))}
                          onChange={(event) => updateNoteEvent(note.id, { durationBeats: snapBeatToGrid(Number(event.target.value)) })}
                        />
                        <input
                          aria-label="소리 세기"
                          max="1"
                          min="0.05"
                          step="0.01"
                          type="number"
                          value={Number(note.velocity.toFixed(2))}
                          onChange={(event) => updateNoteEvent(note.id, { velocity: Number(event.target.value) })}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="transport-bar">
            <div className="transport-buttons">
              <button type="button" onPointerDown={resetPlayback}>■</button>
              <button type="button" onPointerDown={togglePlayback}>{isPlaying ? '⏸' : '▶'}</button>
              <span>스페이스바 일시정지 / 이어재생</span>
            </div>

            <div className="selected-note-summary">
              {selectedNote ? `${getPitchName(selectedNote.pitch)} · 세기 ${Math.round(selectedNote.velocity * 100)}` : '음표 선택 없음'}
            </div>

            <span />
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
