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
import type { InstrumentId, Note, Project, Track } from './types/music'

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
const DEFAULT_PROJECT_LENGTH_BEATS = DEFAULT_BARS * BEATS_PER_BAR
const HISTORY_LIMIT = 80
const KEYBOARD_INPUT_MAP: Record<string, number> = {
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
}

const PITCHES = Array.from({ length: 36 }, (_, index) => 84 - index)
const DRUM_PITCHES = Array.from({ length: 47 }, (_, index) => 81 - index)
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const DRUM_LABELS: Record<number, string> = {
  35: 'Kick',
  36: 'Kick 1',
  37: 'Side Stick',
  38: 'Snare',
  39: 'Clap',
  40: 'E. Snare',
  41: 'Low Floor Tom',
  42: 'Closed Hat',
  43: 'High Floor Tom',
  44: 'Pedal Hat',
  45: 'Low Tom',
  46: 'Open Hat',
  47: 'Low-Mid Tom',
  48: 'Hi-Mid Tom',
  49: 'Crash 1',
  50: 'High Tom',
  51: 'Ride 1',
  52: 'China',
  53: 'Ride Bell',
  54: 'Tambourine',
  55: 'Splash',
  56: 'Cowbell',
  57: 'Crash 2',
  58: 'Vibraslap',
  59: 'Ride 2',
  60: 'Hi Bongo',
  61: 'Low Bongo',
  62: 'Mute Conga',
  63: 'Open Conga',
  64: 'Low Conga',
  65: 'Hi Timbale',
  66: 'Low Timbale',
  67: 'Hi Agogo',
  68: 'Low Agogo',
  69: 'Cabasa',
  70: 'Maracas',
  71: 'Short Whistle',
  72: 'Long Whistle',
  73: 'Short Guiro',
  74: 'Long Guiro',
  75: 'Claves',
  76: 'Hi Wood Block',
  77: 'Low Wood Block',
  78: 'Mute Cuica',
  79: 'Open Cuica',
  80: 'Mute Triangle',
  81: 'Open Triangle',
}
const DRUM_INSTRUMENT = { family: 'Drums', icon: '◉', id: 'drums', label: 'Power Drum Kit', program: -1 }
const INSTRUMENT_OPTIONS = [DRUM_INSTRUMENT, ...GENERAL_MIDI_INSTRUMENTS]
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
  Chromatic: 'Chromatic Percussion',
  Lead: 'Synth Lead',
  Pad: 'Synth Pad',
  FX: 'Synth FX',
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
    term: 'Velocity',
    label: '소리 세기',
    description: '음표 하나가 얼마나 세게 연주되는지 정합니다.',
  },
  {
    term: 'Pitch Bend',
    label: '음높이 휘기',
    description: '음이 위아래로 미끄러지듯 변하는 느낌입니다.',
  },
  {
    term: 'Volume',
    label: '트랙 음량',
    description: '트랙 전체가 얼마나 크게 들리는지 정합니다.',
  },
  {
    term: 'Panpot',
    label: '좌우 위치',
    description: '소리가 왼쪽, 가운데, 오른쪽 중 어디서 들릴지 정합니다.',
  },
  {
    term: 'Expression',
    label: '연주 느낌',
    description: '연주 중간의 세밀한 크기 변화를 다룹니다.',
  },
  {
    term: 'Modulation',
    label: '떨림',
    description: '비브라토처럼 음에 흔들림을 더하는 값입니다.',
  },
  {
    term: 'Event',
    label: '이벤트',
    description: '선택한 음표의 시작, 길이, 음높이를 직접 편집합니다.',
  },
]

type PlaybackInstrument = ReturnType<typeof createInstrument>
type EditorTab = 'piano-roll' | 'arrange' | 'tempo'
type ToolMode = 'draw' | 'erase' | 'select' | 'lasso'
type NoteDivision = (typeof NOTE_DIVISIONS)[number]

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
  notes: Note[]
  startClientX: number
  trackId: string
}

type KeyboardRecordingNote = {
  noteId: string
  pitch: number
  startBeat: number
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
  notes: Note[]
  nextIndex: number
}

type OtherNote = Note & { trackId: string }

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
  finishKeyboardNote: (code: string) => void
  startKeyboardNote: (code: string) => void
  updatePatternRepeatPreview: (clientX: number) => void
  updateLassoSelectionFromPointer: (clientX: number, clientY: number) => void
  moveDraggedNoteFromPointer: (clientX: number, clientY: number) => void
  pasteSelectedNotes: () => void
  redoProject: () => void
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
        name: 'Track 1',
        instrumentId: 'gm-0',
        volume: 0.85,
        mute: false,
        channel: 1,
        color: TRACK_COLORS[0],
      },
    ],
    notesByTrack: {
      [firstTrackId]: [],
    },
  }
}

function normalizeProject(project: Project): Project {
  const fallbackTrackId = createId('track')
  const tracks = project.tracks?.length
      ? project.tracks.map((track, index) => ({
        ...track,
        mute: track.mute ?? false,
        channel: track.channel ?? (track.instrumentId === 'drums' ? 10 : Math.min(16, index + 1)),
        color: track.color ?? TRACK_COLORS[index % TRACK_COLORS.length],
      }))
    : [
        {
          id: fallbackTrackId,
          name: 'Track 1',
          instrumentId: 'gm-0',
          volume: 0.85,
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

function App() {
  const [project, setProjectState] = useState<Project>(() => readSavedProject())
  const [tempoInput, setTempoInput] = useState(() => String(project.tempo))
  const [resizingNoteId, setResizingNoteId] = useState<string | null>(null)
  const [instrumentMenuTrackId, setInstrumentMenuTrackId] = useState<string | null>(null)
  const [fileMenuOpen, setFileMenuOpen] = useState(false)
  const [editMenuOpen, setEditMenuOpen] = useState(false)
  const [isExportingMp3, setIsExportingMp3] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackBeat, setPlaybackBeat] = useState(0)
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
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([])
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null)
  const [lassoPoints, setLassoPoints] = useState<LassoPoint[]>([])
  const [keyboardInputEnabled, setKeyboardInputEnabled] = useState(false)
  const [activeDetailTerm, setActiveDetailTerm] = useState(TERMINOLOGY_HELP[0].term)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pianoRollRef = useRef<HTMLDivElement>(null)
  const projectRef = useRef(project)
  const undoStackRef = useRef<Project[]>([])
  const redoStackRef = useRef<Project[]>([])
  const savedProjectJsonRef = useRef('')
  const activeInstrumentsRef = useRef<PlaybackInstrument[]>([])
  const activePlaybackTracksRef = useRef<ActivePlaybackTrack[]>([])
  const activeTimeoutsRef = useRef<number[]>([])
  const activeIntervalsRef = useRef<number[]>([])
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
    moveDraggedNoteFromPointer: () => {},
    pasteSelectedNotes: () => {},
    redoProject: () => {},
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
  const projectLengthBeats = Math.max(DEFAULT_PROJECT_LENGTH_BEATS, projectEndBeat)
  const visibleBars = getVisibleBars(projectLengthBeats)
  const totalBeats = visibleBars * BEATS_PER_BAR
  const stepsPerBeat = noteDivision / 4
  const defaultDurationBeats = Math.max(MIN_DURATION_BEATS, Math.round(lastNoteDurationRef.current * stepsPerBeat) / stepsPerBeat)
  const totalSteps = totalBeats * stepsPerBeat
  const rollPitches = selectedTrack?.instrumentId === 'drums' ? DRUM_PITCHES : PITCHES
  const tempoGraphPercent = Math.min(
    100,
    Math.max(0, ((project.tempo - TEMPO_GRAPH_MIN) / (TEMPO_GRAPH_MAX - TEMPO_GRAPH_MIN)) * 100),
  )
  const beatWidth = DEFAULT_BEAT_WIDTH
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
  interactionHandlersRef.current.pasteSelectedNotes = pasteSelectedNotes
  interactionHandlersRef.current.redoProject = redoProject
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

      }

      const target = event.target
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)

      if (!event.repeat && !isTypingTarget) {
        interactionHandlersRef.current.startKeyboardNote(event.code)
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
      interactionHandlersRef.current.finishKeyboardNote(event.code)
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
          totalBeatsRef.current * DEFAULT_BEAT_WIDTH,
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
  }, [isPlaying])

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
        name: `Track ${current.tracks.length + 1}`,
        instrumentId: 'gm-0',
        volume: 0.85,
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
    if (selectedTrack?.instrumentId !== 'drums') return mappedPitch

    const drumIndex = Object.keys(KEYBOARD_INPUT_MAP).indexOf(code)
    return DRUM_PITCHES[Math.min(DRUM_PITCHES.length - 1, Math.max(0, 34 + drumIndex))]
  }

  function startKeyboardNote(code: string) {
    if (!keyboardInputEnabled || !isPlaying || !selectedTrack) return
    if (keyboardRecordingRef.current.has(code)) return

    const pitch = getKeyboardInputPitch(code)
    if (pitch === null) return

    const startBeat = snapBeatToGrid(getCurrentPlaybackBeat())
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
      noteId: note.id,
      pitch,
      startBeat,
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
    void previewNote(selectedTrack.instrumentId, pitch, note.velocity, 0.25)
  }

  function finishKeyboardNote(code: string) {
    const recording = keyboardRecordingRef.current.get(code)
    if (!recording || !selectedTrack) return

    keyboardRecordingRef.current.delete(code)
    const endBeat = Math.max(recording.startBeat + MIN_DURATION_BEATS, snapBeatToGrid(getCurrentPlaybackBeat()))
    const durationBeats = Math.max(MIN_DURATION_BEATS, endBeat - recording.startBeat)
    setProject((current) => {
      const notes = current.notesByTrack[selectedTrack.id] ?? []
      return {
        ...current,
        notesByTrack: {
          ...current.notesByTrack,
          [selectedTrack.id]: notes.map((note) =>
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
    const roll = pianoRollRef.current
    const geometry = rollPointerGeometryRef.current
    if (!roll || !geometry) return

    const { endRow, endStep, startRow, startStep } = getSelectionBounds(selection)
    const cellWidth = geometry.gridWidth / geometry.totalSteps
    setSelectionBox({
      height: (endRow - startRow + 1) * ROLL_ROW_HEIGHT,
      left: KEY_COLUMN_WIDTH + startStep * cellWidth,
      selecting: selection.active,
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
    if (selectedTrack?.instrumentId === 'drums') {
      return DRUM_LABELS[pitch] ?? `Drum ${pitch}`
    }

    const name = getPitchName(pitch)
    return name.startsWith('C') ? name : ''
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
      notes: selectedPatternNotes,
      startClientX: event.clientX,
      trackId: selectedTrack.id,
    }
  }

  function updatePatternRepeatPreview(clientX: number) {
    const repeat = patternRepeatRef.current
    if (!repeat?.active || !selectionBox) return

    const nextWidth = Math.max(repeat.baseWidth, repeat.baseWidth + clientX - repeat.startClientX)
    if (Math.abs(nextWidth - selectionBox.width) < 1) return
    setSelectionBox((current) => (current ? { ...current, selecting: false, width: nextWidth } : current))
  }

  function finishPatternRepeat() {
    const repeat = patternRepeatRef.current
    if (!repeat?.active) return
    patternRepeatRef.current = null

    const currentWidth = selectionBox?.width ?? repeat.baseWidth
    const repeatCount = Math.floor(currentWidth / repeat.baseWidth)
    if (repeatCount <= 1) return

    const spanBeats = repeat.baseEndBeat - repeat.baseStartBeat
    const nextNotes: Note[] = []
    for (let repeatIndex = 1; repeatIndex < repeatCount; repeatIndex += 1) {
      const beatOffset = spanBeats * repeatIndex
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
      alert('MP3 파일을 만들지 못했습니다. 음표가 너무 많거나 브라우저 오디오 렌더링이 실패했을 수 있습니다.')
    } finally {
      setIsExportingMp3(false)
    }
  }

  function getAutoMixTarget(track: Track) {
    const program = track.instrumentId.startsWith('gm-')
      ? Number(track.instrumentId.slice(3))
      : null

    if (track.instrumentId === 'drums') return 0.5
    if (program !== null && program >= 32 && program < 40) return 0.54
    if (program !== null && program >= 56 && program < 64) return 0.48
    if (program !== null && program >= 80 && program < 104) return 0.5
    if (program !== null && program >= 40 && program < 56) return 0.58
    return 0.62
  }

  function autoMixTracks() {
    setProject((current) => {
      const mixLength = Math.max(DEFAULT_PROJECT_LENGTH_BEATS, current.lengthBeats ?? 0, getNotesEndBeat(current.notesByTrack))
      const nextTracks = current.tracks.map((track) => {
        const notes = current.notesByTrack[track.id] ?? []
        if (notes.length === 0) return track

        const energy = notes.reduce(
          (total, note) => total + note.durationBeats * note.velocity * note.velocity,
          0,
        )
        const density = notes.length / Math.max(1, mixLength)
        const rms = Math.sqrt(energy / Math.max(1, mixLength))
        const target = getAutoMixTarget(track)
        const densityTrim = Math.max(0.68, 1 - density * 0.08)
        const nextVolume = Math.max(
          0.28,
          Math.min(1, (target / Math.max(0.12, rms)) * densityTrim),
        )
        const roundedVolume = Math.round(nextVolume * 100) / 100

        return nearlyEqual(track.volume, roundedVolume)
          ? track
          : { ...track, volume: roundedVolume }
      })

      return nextTracks.every((track, index) => track === current.tracks[index])
        ? current
        : { ...current, tracks: nextTracks }
    })
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
        alert('파일을 불러오지 못했습니다. BeginnerMusic JSON 또는 MIDI 파일인지 확인해 주세요.')
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
    const file = event.dataTransfer.files[0]
    if (!file) return
    loadProjectFromFile(file)
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

  function disposePlaybackVoices() {
    playbackSessionRef.current += 1
    activeTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
    activeTimeoutsRef.current = []
    activeIntervalsRef.current.forEach((intervalId) => window.clearInterval(intervalId))
    activeIntervalsRef.current = []
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
    const frequency = Tone.Frequency(note.pitch, 'midi').toFrequency()

    const startTimeoutId = window.setTimeout(() => {
      if (sessionId !== playbackSessionRef.current) return

      const activeCount = track.activeFrequencies.get(frequency) ?? 0
      track.activeFrequencies.set(frequency, activeCount + 1)
      if (activeCount === 0) {
        track.instrument.triggerAttack(frequency, Tone.now(), note.velocity)
      }

      const releaseTimeoutId = window.setTimeout(() => {
        if (sessionId !== playbackSessionRef.current) return
        const nextActiveCount = (track.activeFrequencies.get(frequency) ?? 1) - 1
        if (nextActiveCount > 0) {
          track.activeFrequencies.set(frequency, nextActiveCount)
          return
        }

        track.activeFrequencies.delete(frequency)
        track.instrument.triggerRelease(frequency, Tone.now())
      }, Math.ceil(remainingDurationSeconds * 1000))
      activeTimeoutsRef.current.push(releaseTimeoutId)
    }, Math.ceil(delayMs))

    activeTimeoutsRef.current.push(startTimeoutId)
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
      return
    }

    playbackStartBeatRef.current = safeStartBeat
    playbackStartMsRef.current = performance.now()
    setPlaybackPosition(safeStartBeat)
    setIsPlaying(true)
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
              <span>File</span><span className="menu-chevron">⌄</span>
            </button>
            {fileMenuOpen ? (
              <div className="file-menu">
                <button type="button" onPointerDown={createNewProject}>New</button>
                <button type="button" onPointerDown={openProjectFile}>Open MIDI / Project</button>
                <button type="button" onPointerDown={saveProjectFile}>Save Project</button>
                <button type="button" disabled={isExportingMp3} onPointerDown={saveMp3File}>
                  {isExportingMp3 ? 'Exporting MP3...' : 'Save MP3'}
                </button>
                <button type="button" onPointerDown={saveMidiFile}>Save MIDI</button>
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
              <span>Edit</span><span className="menu-chevron">⌄</span>
            </button>
            {editMenuOpen ? (
              <div className="file-menu">
                <button type="button" disabled={undoStackRef.current.length === 0} onPointerDown={undoProject}>
                  Undo
                </button>
                <button type="button" disabled={redoStackRef.current.length === 0} onPointerDown={redoProject}>
                  Redo
                </button>
                <button type="button" disabled={selectedPatternNotes.length === 0} onPointerDown={copySelectedNotes}>
                  Copy
                </button>
                <button type="button" disabled={selectedPatternNotes.length === 0} onPointerDown={cutSelectedNotes}>
                  Cut
                </button>
                <button type="button" disabled={!patternClipboardRef.current} onPointerDown={pasteSelectedNotes}>
                  Paste
                </button>
                <button type="button" disabled={selectedPatternNotes.length === 0} onPointerDown={duplicateSelectedNotes}>
                  Duplicate
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className={activeEditorTab === 'piano-roll' ? 'is-active' : ''}
            onPointerDown={() => setActiveEditorTab('piano-roll')}
          >
            ▥ Piano Roll
          </button>
          <button
            type="button"
            className={activeEditorTab === 'arrange' ? 'is-active' : ''}
            onPointerDown={() => setActiveEditorTab('arrange')}
          >
            ▤ Arrange
          </button>
          <button
            type="button"
            className={activeEditorTab === 'tempo' ? 'is-active' : ''}
            onPointerDown={() => setActiveEditorTab('tempo')}
          >
            ◷ Tempo
          </button>
        </nav>

        <input
          aria-label="프로젝트 이름"
          className="project-title-input"
          value={project.title}
          onChange={(event) => updateProjectTitle(event.target.value)}
        />

        <nav className="top-actions" aria-label="상단 작업">
          <button type="button" className="future-button" title="추후 설정 화면으로 연결 예정">Settings</button>
          <button type="button" className="future-button" title="추후 도움말로 연결 예정">Help</button>
          <button type="button" className="future-button" title="추후 로그인으로 연결 예정">Sign In</button>
        </nav>

        <input
          ref={fileInputRef}
          className="hidden-file-input"
          type="file"
          accept="application/json,.json,.beginner-music.json,.mid,.midi,audio/midi"
          onChange={loadProjectFile}
        />
      </header>

      {isDraggingFile ? (
        <div className="drop-overlay" aria-hidden="true">
          JSON 또는 MIDI 파일을 놓으면 바로 불러옵니다
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
                <span className="instrument-column-title">Categories</span>
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
                <span className="instrument-column-title">Instruments</span>
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
                  checked={selectedInstrumentId === 'drums'}
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
                Rhythm Track
              </label>

              <div className="instrument-dialog-actions">
                <button type="button" onPointerDown={closeInstrumentDialog}>Cancel</button>
                <button type="button" className="primary-action" onPointerDown={confirmInstrumentDialog}>
                  OK
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
            <strong>{selectedTrack?.name ?? 'Track 1'}</strong>
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
                  <strong>Track {index + 1}</strong>
                  <span>{getInstrumentLabel(track.instrumentId)}</span>
                </div>

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
                        CH {channelIndex + 1}
                      </option>
                    ))}
                  </select>
                </div>
              </article>
            ))}
            <button type="button" className="add-track-button" onPointerDown={addTrack}>＋ Add Track</button>
            <button type="button" className="automix-track-button" onPointerDown={autoMixTracks}>AutoMix</button>
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
              {selectedTrack ? getInstrumentLabel(selectedTrack.instrumentId) : 'Piano'}
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
              <button type="button" className="future-button" title="추후 음표 도구">♪</button>
              <button
                type="button"
                className={keyboardInputEnabled ? 'is-active' : ''}
                onPointerDown={() => setKeyboardInputEnabled((current) => !current)}
                title="재생 중 A W S E D... 키로 실시간 입력"
              >
                Keys
              </button>
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
              <svg className="lasso-overlay" aria-hidden="true">
                <polyline
                  points={lassoPoints.map((point) => `${point.viewX},${point.viewY}`).join(' ')}
                />
              </svg>
            ) : null}

            {rollPitches.map((pitch) => (
              <div className="roll-row" key={pitch}>
                <button
                  type="button"
                  className={`${NOTE_NAMES[pitch % 12].includes('#') ? 'piano-key is-black' : 'piano-key'}${
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
                          aria-label={`${getPitchName(note.pitch)} 음표`}
                        >
                          <span className="note-label">{getPitchName(note.pitch)}</span>
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
            </>
          ) : activeEditorTab === 'arrange' ? (
            <div className="arrange-view" aria-label="편곡 배치" style={rollSurfaceStyle}>
              <header>
                <strong>Arrange</strong>
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
                  return (
                    <div className="arrange-lane" key={track.id}>
                      <button
                        type="button"
                        className={track.id === project.selectedTrackId ? 'is-active' : ''}
                        onPointerDown={() => selectTrack(track.id)}
                      >
                        <img alt="" draggable={false} src={getInstrumentImage(track.instrumentId)} />
                        <span>Track {index + 1}</span>
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
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="tempo-view" aria-label="템포 편집" style={rollSurfaceStyle}>
              <header>
                <strong>Tempo</strong>
                <span>그래프를 클릭해서 현재 프로젝트 BPM을 조절합니다.</span>
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
                  {project.tempo} BPM
                </span>
              </div>
              <div className="tempo-view-controls">
                <button type="button" onPointerDown={() => updateTempo(project.tempo - 1)}>−</button>
                <input
                  aria-label="BPM"
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
                <small>{item.label}</small>
              </button>
            ))}
          </div>

          <div className="velocity-lane">
            <div className="tempo-panel" aria-label="템포 설정">
              <label>
                <span>BPM</span>
                <button type="button" onPointerDown={() => updateTempo(project.tempo - 5)}>−</button>
                <input
                  aria-label="BPM"
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
                <span>Velocity</span>
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
                <span>Volume</span>
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
                <span>Pan</span>
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
                <span>Pitch Bend</span>
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
                <span>Expression</span>
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
                <span>Modulation</span>
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

            {activeDetailTerm === 'Event' ? (
              <div className="event-editor">
                <strong>Event</strong>
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
              <span>Space 일시정지 / 이어재생</span>
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
