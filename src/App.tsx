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
const DEFAULT_STEP_WIDTH = 20
const AUTO_SAVE_DELAY_MS = 500
const ACTIVE_EDIT_AUTO_SAVE_DELAY_MS = 1200
const FLOAT_EPSILON = 0.0001
const PLAYBACK_SCHEDULER_MS = 80
const PLAYBACK_LOOKAHEAD_BEATS = 0.32
const TEMPO_PRESETS = [60, 72, 80, 90, 100, 110, 120, 128, 140, 160, 180, 200]
const PLAYHEAD_SCROLL_PADDING = 160
const NOTE_DIVISIONS = [8, 16, 32, 64, 128] as const
const ROLL_ZOOM_LEVELS = [0.5, 0.75, 1, 1.5, 2, 3] as const
const DEFAULT_PROJECT_LENGTH_BEATS = DEFAULT_BARS * BEATS_PER_BAR
const HISTORY_LIMIT = 80

const PITCHES = Array.from({ length: 36 }, (_, index) => 84 - index)
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
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
]

type PlaybackInstrument = ReturnType<typeof createInstrument>
type ToolMode = 'draw' | 'erase' | 'select'
type NoteDivision = (typeof NOTE_DIVISIONS)[number]
type RollZoom = (typeof ROLL_ZOOM_LEVELS)[number]

type NoteDrag = {
  active: boolean
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

type TrackContextMenu = {
  trackId: string
  x: number
  y: number
} | null

type PianoRollContextMenu = {
  x: number
  y: number
} | null

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
  moveDraggedNoteFromPointer: (clientX: number, clientY: number) => void
  pasteSelectedNotes: () => void
  redoProject: () => void
  undoProject: () => void
  updatePatternSelectionFromPointer: (clientX: number, clientY: number) => void
  stopHeldPreview: () => void
  togglePlayback: () => void
  zoomRoll: (direction: -1 | 1) => void
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
        color: track.color ?? TRACK_COLORS[index % TRACK_COLORS.length],
      }))
    : [
        {
          id: fallbackTrackId,
          name: 'Track 1',
          instrumentId: 'gm-0',
          volume: 0.85,
          mute: false,
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

function getNextZoom(currentZoom: RollZoom, direction: -1 | 1) {
  const currentIndex = ROLL_ZOOM_LEVELS.indexOf(currentZoom)
  const nextIndex = Math.min(
    ROLL_ZOOM_LEVELS.length - 1,
    Math.max(0, currentIndex + direction),
  )

  return ROLL_ZOOM_LEVELS[nextIndex]
}

function App() {
  const [project, setProjectState] = useState<Project>(() => readSavedProject())
  const [tempoInput, setTempoInput] = useState(() => String(project.tempo))
  const [lengthSecondsInput, setLengthSecondsInput] = useState(() =>
    String(Math.round(((project.lengthBeats ?? DEFAULT_PROJECT_LENGTH_BEATS) * 60) / project.tempo)),
  )
  const [resizingNoteId, setResizingNoteId] = useState<string | null>(null)
  const [instrumentMenuTrackId, setInstrumentMenuTrackId] = useState<string | null>(null)
  const [fileMenuOpen, setFileMenuOpen] = useState(false)
  const [editMenuOpen, setEditMenuOpen] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackBeat, setPlaybackBeat] = useState(0)
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
  const totalStepsRef = useRef(0)
  const heldPreviewRef = useRef<HeldPreview | null>(null)
  const previewTokenRef = useRef(0)
  const lastNoteDurationRef = useRef(MIN_DURATION_BEATS * 2)
  const noteDragRef = useRef<NoteDrag | null>(null)
  const patternClipboardRef = useRef<PatternClipboard | null>(null)
  const patternSelectionRef = useRef<PatternSelection | null>(null)
  const eraseRef = useRef({ active: false, lastKey: '' })
  const rightEraseRef = useRef({ active: false, lastKey: '' })
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
    moveDraggedNoteFromPointer: () => {},
    pasteSelectedNotes: () => {},
    redoProject: () => {},
    updatePatternSelectionFromPointer: () => {},
    undoProject: () => {},
    stopHeldPreview: () => {},
    togglePlayback: () => {},
    zoomRoll: () => {},
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
  const projectEndBeat = useMemo(() => getNotesEndBeat(project.notesByTrack), [project.notesByTrack])
  const projectLengthBeats = Math.max(
    DEFAULT_PROJECT_LENGTH_BEATS,
    project.lengthBeats ?? DEFAULT_PROJECT_LENGTH_BEATS,
    projectEndBeat,
  )
  const visibleBars = getVisibleBars(projectLengthBeats)
  const totalBeats = visibleBars * BEATS_PER_BAR
  const stepsPerBeat = noteDivision / 4
  const defaultDurationBeats = Math.max(MIN_DURATION_BEATS, Math.round(lastNoteDurationRef.current * stepsPerBeat) / stepsPerBeat)
  const lengthSeconds = Math.round((projectLengthBeats * 60) / project.tempo)
  const totalSteps = totalBeats * stepsPerBeat
  const stepWidth = DEFAULT_STEP_WIDTH * rollZoom
  const rollTimelineStyle = { gridTemplateColumns: `repeat(${visibleBars}, minmax(64px, 1fr))` }
  const rollShellStyle = {
    '--bar-width': `${stepWidth * stepsPerBeat * BEATS_PER_BAR}px`,
    '--beat-width': `${stepWidth * stepsPerBeat}px`,
    '--roll-grid-height': `${PITCHES.length * ROLL_ROW_HEIGHT}px`,
    '--roll-grid-width': `${totalSteps * stepWidth}px`,
    '--step-width': `${stepWidth}px`,
    '--total-steps': totalSteps,
    gridTemplateColumns: `64px minmax(${totalSteps * stepWidth}px, 1fr)`,
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
    totalStepsRef.current = totalSteps
    pianoRollRef.current?.style.setProperty(
      '--playhead-left',
      `${Math.min(100, (playbackBeat / totalBeats) * 100)}%`,
    )
  }, [playbackBeat, totalBeats, totalSteps])

  useEffect(() => {
    setTempoInput(String(project.tempo))
  }, [project.tempo])

  useEffect(() => {
    setLengthSecondsInput(String(lengthSeconds))
  }, [lengthSeconds])

  useEffect(() => {
    setSelectedNoteIds([])
    setSelectionBox(null)
    patternSelectionRef.current = null
  }, [selectedTrack?.id])

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

  interactionHandlersRef.current.togglePlayback = togglePlayback
  interactionHandlersRef.current.copySelectedNotes = copySelectedNotes
  interactionHandlersRef.current.cutSelectedNotes = cutSelectedNotes
  interactionHandlersRef.current.deleteSelectedNote = deleteSelectedNote
  interactionHandlersRef.current.moveDraggedNoteFromPointer = moveDraggedNoteFromPointer
  interactionHandlersRef.current.eraseDraggedCellFromPointer = eraseDraggedCellFromPointer
  interactionHandlersRef.current.eraseRightDraggedCellFromPointer = eraseRightDraggedCellFromPointer
  interactionHandlersRef.current.finishPatternSelection = finishPatternSelection
  interactionHandlersRef.current.pasteSelectedNotes = pasteSelectedNotes
  interactionHandlersRef.current.redoProject = redoProject
  interactionHandlersRef.current.undoProject = undoProject
  interactionHandlersRef.current.updatePatternSelectionFromPointer = updatePatternSelectionFromPointer
  interactionHandlersRef.current.stopHeldPreview = stopHeldPreview
  interactionHandlersRef.current.zoomRoll = zoomRoll

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

      if (event.code === 'Delete' || event.code === 'Backspace') {
        const target = event.target
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          (target instanceof HTMLElement && target.isContentEditable)
        ) {
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

    function flushPointerMove() {
      pointerMoveFrameRef.current = 0
      const pendingMove = pendingPointerMoveRef.current
      pendingPointerMoveRef.current = null
      if (!pendingMove) return

      interactionHandlersRef.current.moveDraggedNoteFromPointer(pendingMove.clientX, pendingMove.clientY)
      interactionHandlersRef.current.eraseDraggedCellFromPointer(pendingMove.clientX, pendingMove.clientY)
      interactionHandlersRef.current.updatePatternSelectionFromPointer(pendingMove.clientX, pendingMove.clientY)
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

    function clearPointerState() {
      if (pointerMoveFrameRef.current !== 0) {
        window.cancelAnimationFrame(pointerMoveFrameRef.current)
        flushPointerMove()
      }
      pendingPointerMoveRef.current = null
      interactionHandlersRef.current.finishPatternSelection()
      noteDragRef.current = null
      patternSelectionRef.current = null
      eraseRef.current = { active: false, lastKey: '' }
      rightEraseRef.current = { active: false, lastKey: '' }
      erasedNoteIdsRef.current = new Set()
      keyPreviewRef.current.active = false
      rollPointerGeometryRef.current = null
      setDraggingNoteId(null)
      interactionHandlersRef.current.stopHeldPreview()
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', clearPointerState)
    window.addEventListener('pointercancel', clearPointerState)
    window.addEventListener('contextmenu', clearPointerState)
    window.addEventListener('blur', clearPointerState)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', clearPointerState)
      window.removeEventListener('pointercancel', clearPointerState)
      window.removeEventListener('contextmenu', clearPointerState)
      window.removeEventListener('blur', clearPointerState)
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
          totalStepsRef.current * DEFAULT_STEP_WIDTH * rollZoom,
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

  function updateProjectLengthSeconds(seconds: number) {
    if (!Number.isFinite(seconds) || seconds <= 0) return

    const nextLengthBeats = Math.max(
      DEFAULT_PROJECT_LENGTH_BEATS,
      projectEndBeat,
      snapBeatToGrid((seconds * project.tempo) / 60),
    )
    setProject((current) =>
      nearlyEqual(current.lengthBeats ?? DEFAULT_PROJECT_LENGTH_BEATS, nextLengthBeats)
        ? current
        : { ...current, lengthBeats: nextLengthBeats },
    )
    setLengthSecondsInput(String(Math.round((nextLengthBeats * 60) / project.tempo)))
  }

  function commitLengthSecondsInput() {
    const parsedSeconds = Number(lengthSecondsInput)
    if (Number.isFinite(parsedSeconds) && parsedSeconds > 0) {
      updateProjectLengthSeconds(parsedSeconds)
      return
    }

    setLengthSecondsInput(String(lengthSeconds))
  }

  function changeLengthSecondsInput(value: string) {
    setLengthSecondsInput(value)
    const parsedSeconds = Number(value)
    if (!Number.isFinite(parsedSeconds) || parsedSeconds <= 0 || value.trim() === '') return
    updateProjectLengthSeconds(parsedSeconds)
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

  function openPianoRollContextMenu(event: ReactMouseEvent<HTMLElement>) {
    event.preventDefault()
    event.stopPropagation()
    rightEraseRef.current = { active: false, lastKey: '' }
    erasedNoteIdsRef.current = new Set()
    setTrackContextMenu(null)
    setPianoRollContextMenu({
      x: event.clientX,
      y: event.clientY,
    })
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

    if (step < 0 || step >= pointerTotalSteps || rowIndex < 0 || rowIndex >= PITCHES.length) return null
    return { pitch: PITCHES[rowIndex], rowIndex, step }
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
        const rowIndex = PITCHES.indexOf(note.pitch)
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

    if (drag.groupNoteIds.length > 1) {
      moveNoteGroupToCell(drag, pitch, step)
    } else {
      moveNoteToCell(drag.noteId, drag.trackId, pitch, step)
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
    const minPitchDelta = Math.max(...originalNotes.map((note) => PITCHES[PITCHES.length - 1] - note.pitch))
    const maxPitchDelta = Math.min(...originalNotes.map((note) => PITCHES[0] - note.pitch))
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

    if (!noteToDelete || erasedNoteIdsRef.current.has(noteToDelete.id)) return
    erasedNoteIdsRef.current.add(noteToDelete.id)

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
  }

  function eraseNoteAtCellOnce(pitch: number, step: number, eraseState: { lastKey: string }) {
    const key = `${pitch}-${step}`
    if (eraseState.lastKey === key) return
    eraseState.lastKey = key
    eraseNoteAtCell(pitch, step)
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
    const rowIndex = PITCHES.indexOf(pitch)
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
    const groupNoteIds = isPatternMember ? selectedNoteIds : [note.id]
    const groupNoteIdSet = new Set(groupNoteIds)
    noteDragRef.current = {
      active: true,
      groupNoteIds,
      noteId: note.id,
      originalNotes: selectedTrackNotes.filter((item) => groupNoteIdSet.has(item.id)),
      originPitch: note.pitch,
      originStep: Math.round(note.startBeat * stepsPerBeat),
      trackId: selectedTrack.id,
      lastPitch: note.pitch,
      lastStep: Math.round(note.startBeat * stepsPerBeat),
    }
    startHeldPreview(note.pitch, note.velocity)
  }

  function beginRightEraseNote(note: Note, event: ReactPointerEvent<HTMLButtonElement>) {
    if (!selectedTrack || event.button !== 2) return
    if (toolMode !== 'erase') return

    event.preventDefault()
    event.stopPropagation()
    rightEraseRef.current = { active: true, lastKey: '' }
    erasedNoteIdsRef.current = new Set([note.id])
    deleteNote(note.id)
  }

  function beginCellAction(pitch: number, step: number, event: ReactPointerEvent<HTMLElement>) {
    if (!selectedTrack) return

    if (event.button === 2) {
      event.preventDefault()
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

    if (toolMode === 'select' || event.shiftKey) {
      beginPatternSelection(pitch, step, event)
      return
    }

    const existingNote = findNoteAtCell(selectedTrack.id, pitch, step)
    if (existingNote) {
      setDraggingNoteId(existingNote.id)
      cacheRollPointerGeometry()
      noteDragRef.current = {
        active: true,
        groupNoteIds: [existingNote.id],
        noteId: existingNote.id,
        originalNotes: [existingNote],
        originPitch: pitch,
        originStep: step,
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
    }

    cacheRollPointerGeometry()
    noteDragRef.current = {
      active: true,
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
    openPianoRollContextMenu(event)
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
    link.download = `${project.title || 'beginner-music'}.beginner-music.json`
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
          setProject(normalizeProject(importMidiProject(buffer)))
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

  function zoomRoll(direction: -1 | 1) {
    setRollZoom((current) => getNextZoom(current, direction))
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
    instrument: PlaybackInstrument,
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

      instrument.triggerAttack(frequency, Tone.now(), note.velocity)
      const releaseTimeoutId = window.setTimeout(() => {
        if (sessionId !== playbackSessionRef.current) return
        instrument.triggerRelease(frequency, Tone.now())
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
        schedulePlaybackNote(track.instrument, note, currentBeat, sessionId)
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
          velocity: note.velocity * track.volume,
        }))
        .sort((left, right) => left.startBeat - right.startBeat)

      if (notes.length === 0) return

      const instrument = createInstrument(track.instrumentId)
      activeInstrumentsRef.current.push(instrument)
      activePlaybackTracksRef.current.push({
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
              File⌄
            </button>
            {fileMenuOpen ? (
              <div className="file-menu">
                <button type="button" onPointerDown={createNewProject}>New</button>
                <button type="button" onPointerDown={openProjectFile}>Open MIDI / Project</button>
                <button type="button" onPointerDown={saveProjectFile}>Save Project</button>
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
              Edit⌄
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
          <button type="button" className="is-active">▥ Piano Roll</button>
          <button type="button" className="future-button" title="추후 편곡 화면으로 연결 예정">▤ Arrange</button>
          <button type="button" className="future-button" title="추후 템포 상세 편집으로 연결 예정">◷ Tempo</button>
        </nav>

        <input
          aria-label="프로젝트 이름"
          className="project-title-input"
          value={project.title}
          onChange={(event) => updateProjectTitle(event.target.value)}
        />

        <nav className="top-actions" aria-label="상단 작업">
          <button type="button" onPointerDown={autoMixTracks}>Auto Mix</button>
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
        <aside className="track-panel" aria-label="트랙 목록">
          <div className="track-toolbar">
            <button type="button" className="back-button">‹</button>
            <strong>{selectedTrack?.name ?? 'Track 1'}</strong>
            <button type="button" className="menu-button">☰</button>
          </div>

          <div className="track-list">
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
                  <span>CH {index + 1}</span>
                </div>
              </article>
            ))}
          </div>

          <button type="button" className="add-track-button" onPointerDown={addTrack}>＋ Add Track</button>
        </aside>

        <section className="piano-roll-area" aria-label="피아노 롤">
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
              <button type="button" className="future-button" title="추후 음표 도구">♪</button>
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
                aria-hidden="true"
              />
            ) : null}

            {PITCHES.map((pitch) => (
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
                  {getPitchName(pitch)}
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
                            openPianoRollContextMenu(event)
                          }}
                          aria-label={`${getPitchName(note.pitch)} 음표`}
                        >
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
        </section>

        <section className="detail-panel" aria-label="세부 편집">
          <div className="detail-tabs" aria-label="편집 탭">
            {TERMINOLOGY_HELP.map((item, index) => (
              <button
                className={index === 0 ? 'is-active' : 'future-button'}
                key={item.term}
                title={`${item.label}: ${item.description}`}
                type="button"
              >
                <span>{item.term}</span>
                <small>{item.label}</small>
              </button>
            ))}
          </div>

          <div className="velocity-lane">
            <div className="terminology-strip" aria-label="용어 설명">
              {TERMINOLOGY_HELP.map((item) => (
                <article key={item.term}>
                  <strong>{item.label}</strong>
                  <span>{item.description}</span>
                </article>
              ))}
            </div>
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
              <label>
                <span>길이(초)</span>
                <input
                  aria-label="곡 길이 초"
                  inputMode="numeric"
                  type="text"
                  value={lengthSecondsInput}
                  onBlur={commitLengthSecondsInput}
                  onChange={(event) => changeLengthSecondsInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.currentTarget.blur()
                    }
                  }}
                />
                <button type="button" onPointerDown={() => updateProjectLengthSeconds(lengthSeconds + 10)}>＋10</button>
              </label>
            </div>

            {selectedTrackNotes.map((note) => (
              <button
                type="button"
                className={note.id === project.selectedNoteId ? 'velocity-bar is-selected' : 'velocity-bar'}
                key={note.id}
                style={{
                  left: `${(note.startBeat / totalBeats) * 100}%`,
                  height: `${Math.max(8, note.velocity * 100)}%`,
                }}
                onPointerDown={() =>
                  setProject((current) =>
                    current.selectedNoteId === note.id
                      ? current
                      : { ...current, selectedNoteId: note.id },
                  )
                }
                aria-label={`${getPitchName(note.pitch)} 소리 세기`}
              />
            ))}
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

            <button type="button" disabled={!selectedNote} onPointerDown={deleteSelectedNote}>Delete</button>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
