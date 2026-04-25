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
import { expandProjectForArrangement, getTrackPlacements, getTrackSourceEndBeat } from './lib/arrangement/trackArrangement'
import {
  changePreviewNote,
  createInstrument,
  disposePreviewNote,
  ensureAudioReady,
  getInstrumentPreviewPitch,
  isDrumInstrument,
  previewNote,
  silenceAllAudioOutput,
  startPreviewNote,
  stopAllPreviewAudio,
  stopPreviewNoteImmediately,
  stopPreviewNote,
  waitForInstrumentReady,
  type HeldPreview,
} from './lib/audio/toneTransport'
import {
  getInstrumentIcon,
  getInstrumentImage,
  getInstrumentLabel,
} from './lib/midi/generalMidi'
import { exportMidiProject } from './lib/midi/exportMidi'
import { importMidiProject } from './lib/midi/importMidi'
import {
  ACTIVE_EDIT_AUTO_SAVE_DELAY_MS,
  AUTO_MIX_GENRE_PRESETS,
  AUTO_SAVE_DELAY_MS,
  BEATS_PER_BAR,
  DEFAULT_BEAT_WIDTH,
  DEFAULT_PROJECT_LENGTH_BEATS,
  DRUM_KEYBOARD_PITCHES,
  DRUM_LABELS,
  DRUM_PITCHES,
  EDITING_TAIL_BEATS,
  FLOAT_EPSILON,
  HISTORY_LIMIT,
  INSTRUMENT_CATEGORY_IMAGES,
  INSTRUMENT_CATEGORY_ORDER,
  INSTRUMENT_OPTIONS,
  KEYBOARD_INPUT_CODES,
  KEYBOARD_INPUT_MAP,
  KEY_COLUMN_WIDTH,
  MIN_DURATION_BEATS,
  NOTE_NAMES,
  NOTE_DIVISIONS,
  NOTE_DRAG_SCROLL_MAX_STEP_PX,
  NOTE_DRAG_SCROLL_OUTSIDE_THRESHOLD_PX,
  NOTE_DRAG_SCROLL_SENSITIVITY_PX,
  PLAYBACK_LOOKAHEAD_BEATS,
  PLAYBACK_SCHEDULER_MS,
  PLAYHEAD_AUTO_SCROLL_THROTTLE_MS,
  PLAYHEAD_SCROLL_PADDING,
  ROLL_HEADER_HEIGHT,
  ROLL_ROW_HEIGHT,
  ROLL_ZOOM_LEVELS,
  STORAGE_KEY,
  TEMPO_GRAPH_MAX,
  TEMPO_GRAPH_MIN,
  TEMPO_INPUT_MAX,
  TEMPO_INPUT_MIN,
  TEMPO_PRESETS,
  TEMPO_SECTION_DEFAULT_BARS,
  TERMINOLOGY_HELP,
  TRACK_COLORS,
} from './features/editor/constants'
import {
  buildTempoTimeline,
  clampTempoValue,
  createId,
  createInitialProject,
  getBeatAtSecondsFromTimeline,
  getCategoryLabel,
  getDynamicPitches,
  getGroupedPitchStep,
  getInstrumentCategory,
  getNextZoom,
  getNormalizedTempoSections,
  getNotesEndBeat,
  getPatternRepeatGroupNoteIds,
  getPitchName,
  getSecondsAtBeatFromTimeline,
  getSecondsBetweenBeatsFromTimeline,
  getTempoAtBeat,
  getVisibleBars,
  hasUndoableProjectChange,
  nearlyEqual,
  normalizePatternRepeatGapBeats,
  normalizeProject,
  prunePatternRepeatGroups,
  readSavedProject,
  type TempoTimelineSegment,
} from './features/editor/helpers'
import type { AudioClip, AutoMixSection, InstrumentId, Note, PatternPlacement, PatternRepeatGroup, Project, TempoSection, Track } from './types/music'

type PlaybackInstrument = ReturnType<typeof createInstrument>
type EditorTab = 'piano-roll' | 'arrange' | 'tempo' | 'automix'
type ToolMode = 'draw' | 'erase' | 'select' | 'lasso'
type NoteDivision = (typeof NOTE_DIVISIONS)[number]
type RollZoom = (typeof ROLL_ZOOM_LEVELS)[number]
type AutoMixGenrePreset = (typeof AUTO_MIX_GENRE_PRESETS)[number]['id']
type EditableNoteControlKey = 'velocity' | 'pitchBend' | 'volume' | 'pan' | 'expression' | 'modulation'

type NoteDrag = {
  active: boolean
  grabPitchOffset: number
  grabStepOffset: number
  groupNoteIds: string[]
  noteId: string
  originalNotes: TrackNote[]
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
  existingGroupId: string | null
  gapBeats: number
  notes: TrackNote[]
  repeatCount: number
  startClientX: number
  startRepeatCount: number
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

type TrackPlacementDrag = {
  placementId: string
  startBeat: number
  startClientX: number
  startSpanBeats: number
  type: 'move' | 'resize'
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

type DetailGraphDrag = {
  active: boolean
  hasLast: boolean
  key: EditableNoteControlKey
  lastBeat: number
  lastValue: number
  max: number
  maxBeat: number
  min: number
  minBeat: number
  noteIds: string[]
  pointerId: number
  step: number
}

type ActivePlaybackTrack = {
  id: string
  instrument: PlaybackInstrument
  isDrum: boolean
  notes: Note[]
  nextIndex: number
}

type OtherNote = Note & { trackId: string }
type TrackNote = Note & { trackId: string }

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
  addAutoMixSection: () => void
  copySelectedNotes: () => void
  cutSelectedNotes: () => void
  deleteSelectedNote: () => void
  eraseDraggedCellFromPointer: (clientX: number, clientY: number) => void
  eraseRightDraggedCellFromPointer: (clientX: number, clientY: number) => void
  finishLassoSelection: () => void
  finishPatternSelection: () => void
  finishPatternRepeat: () => void
  finishKeyboardNote: (code: string, eventTimeStamp?: number) => void
  startKeyboardNote: (code: string, eventTimeStamp?: number) => void
  transposeSelectedNotes: (direction: -1 | 1) => void
  ungroupSelectedPattern: () => void
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

function toStoredNote(note: TrackNote): Note {
  const { trackId, ...storedNote } = note
  void trackId
  return storedNote
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
  const [autoMixGenrePreset, setAutoMixGenrePreset] = useState<AutoMixGenrePreset>('default')
  const [selectedAutoMixSectionId, setSelectedAutoMixSectionId] = useState<string | null>(null)
  const [selectedTempoSectionId, setSelectedTempoSectionId] = useState<string | null>(null)
  const [selectedTrackPlacementId, setSelectedTrackPlacementId] = useState<string | null>(null)
  const [activeEditorTab, setActiveEditorTab] = useState<EditorTab>('piano-roll')
  const [toolMode, setToolMode] = useState<ToolMode>('draw')
  const [allTrackMelodyMode, setAllTrackMelodyMode] = useState(false)
  const [, setHistoryVersion] = useState(0)
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
  const [detailPanelOpen, setDetailPanelOpen] = useState(true)
  const [patternRepeatGapInput, setPatternRepeatGapInput] = useState('1')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioFileInputRef = useRef<HTMLInputElement>(null)
  const pianoRollRef = useRef<HTMLDivElement>(null)
  const detailGraphSvgRef = useRef<SVGSVGElement>(null)
  const projectRef = useRef(project)
  const undoStackRef = useRef<Project[]>([])
  const redoStackRef = useRef<Project[]>([])
  const historyBatchDepthRef = useRef(0)
  const historyBatchStartRef = useRef<Project | null>(null)
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
  const playbackStartSecondsRef = useRef(0)
  const playbackBeatRef = useRef(0)
  const playbackTempoTimelineRef = useRef<TempoTimelineSegment[]>([])
  const lastPlayheadAutoScrollAtRef = useRef(0)
  const totalBeatsRef = useRef(0)
  const activeEditorTabRef = useRef<EditorTab>('piano-roll')
  const autoMixPanelOpenRef = useRef(false)
  const heldPreviewRef = useRef<HeldPreview | null>(null)
  const previewTokenRef = useRef(0)
  const lastNoteDurationRef = useRef(MIN_DURATION_BEATS * 2)
  const noteDragRef = useRef<NoteDrag | null>(null)
  const patternClipboardRef = useRef<PatternClipboard | null>(null)
  const trackPlacementDragRef = useRef<TrackPlacementDrag | null>(null)
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
  const detailGraphDragRef = useRef<DetailGraphDrag | null>(null)
  const playbackPressedPitchCountsRef = useRef<Map<number, number>>(new Map())
  const rollPointerCaptureRef = useRef<{ pointerId: number; element: Element } | null>(null)
  const interactionHandlersRef = useRef<InteractionHandlers>({
    addAutoMixSection: () => {},
    copySelectedNotes: () => {},
    cutSelectedNotes: () => {},
    deleteSelectedNote: () => {},
    eraseDraggedCellFromPointer: () => {},
    eraseRightDraggedCellFromPointer: () => {},
    finishLassoSelection: () => {},
    finishPatternSelection: () => {},
    finishPatternRepeat: () => {},
    finishKeyboardNote: () => {},
    startKeyboardNote: () => {},
    transposeSelectedNotes: () => {},
    ungroupSelectedPattern: () => {},
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
  const selectedTrackIsAudio = selectedTrack?.kind === 'audio' || selectedTrack?.instrumentId === 'audio-track'
  const allTrackNotes = useMemo(
    () => project.tracks.flatMap((track) => (
      (project.notesByTrack[track.id] ?? []).map((note) => ({ ...note, trackId: track.id }))
    )),
    [project.notesByTrack, project.tracks],
  )
  const autoMixSections = useMemo(() => project.autoMixSections ?? [], [project.autoMixSections])
  const selectedAutoMixSection = autoMixSections.find((section) => section.id === selectedAutoMixSectionId) ?? null
  const selectedNote = useMemo(
    () => (allTrackMelodyMode ? allTrackNotes : selectedTrackNotes.map((note) => ({ ...note, trackId: selectedTrack?.id ?? '' })))
      .find((note) => note.id === project.selectedNoteId) ?? null,
    [allTrackMelodyMode, allTrackNotes, project.selectedNoteId, selectedTrack?.id, selectedTrackNotes],
  )
  const selectedNoteIdSet = useMemo(() => new Set(selectedNoteIds), [selectedNoteIds])
  const selectedPatternNotes = useMemo(
    () => (allTrackMelodyMode ? allTrackNotes : selectedTrackNotes.map((note) => ({ ...note, trackId: selectedTrack?.id ?? '' })))
      .filter((note) => selectedNoteIdSet.has(note.id)),
    [allTrackMelodyMode, allTrackNotes, selectedNoteIdSet, selectedTrack?.id, selectedTrackNotes],
  )
  const allTrackNotesById = useMemo(
    () => new Map(allTrackNotes.map((note) => [note.id, note])),
    [allTrackNotes],
  )
  const allTrackNoteIdSet = useMemo(() => new Set(allTrackNotes.map((note) => note.id)), [allTrackNotes])
  const patternRepeatGroupByNoteId = useMemo(() => {
    const groupByNoteId = new Map<string, PatternRepeatGroup>()
    ;(project.patternRepeatGroups ?? []).forEach((group) => {
      getPatternRepeatGroupNoteIds(group).forEach((noteId) => {
        groupByNoteId.set(noteId, group)
      })
    })
    return groupByNoteId
  }, [project.patternRepeatGroups])
  const selectedPatternRepeatGroup = useMemo(() => {
    if (selectedNoteIds.length === 0) return null
    const selectedIds = new Set(selectedNoteIds)
    return (project.patternRepeatGroups ?? []).find((group) => {
      const groupNoteIds = getPatternRepeatGroupNoteIds(group)
      return groupNoteIds.length === selectedIds.size && groupNoteIds.every((noteId) => selectedIds.has(noteId))
    }) ?? null
  }, [project.patternRepeatGroups, selectedNoteIds])
  useEffect(() => {
    if (!selectedPatternRepeatGroup) return
    const cellsPerBeat = noteDivision / 4
    const gapSteps = Math.max(0, Math.round(selectedPatternRepeatGroup.gapBeats * cellsPerBeat))
    setPatternRepeatGapInput(String(gapSteps))
  }, [noteDivision, selectedPatternRepeatGroup])
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
  const arrangedProject = useMemo(
    () => (activeEditorTab === 'arrange' ? expandProjectForArrangement(project) : project),
    [activeEditorTab, project],
  )
  const projectEndBeat = useMemo(
    () => {
      const notesEndBeat = getNotesEndBeat(project.notesByTrack)
      const clipsEndBeat = (project.audioClips ?? []).reduce(
        (latestEnd, clip) => Math.max(latestEnd, clip.startBeat + clip.durationBeats),
        0,
      )
      const placementsEndBeat = (project.patternPlacements ?? []).reduce(
        (latestEnd, placement) => Math.max(latestEnd, placement.startBeat + placement.spanBeats),
        0,
      )
      return Math.max(notesEndBeat, clipsEndBeat, placementsEndBeat)
    },
    [project.audioClips, project.notesByTrack, project.patternPlacements],
  )
  const projectLengthBeats = Math.max(DEFAULT_PROJECT_LENGTH_BEATS, projectEndBeat + EDITING_TAIL_BEATS)
  const visibleBars = getVisibleBars(projectLengthBeats)
  const totalBeats = visibleBars * BEATS_PER_BAR
  const tempoSections = useMemo(
    () => getNormalizedTempoSections(project, totalBeats),
    [project, totalBeats],
  )
  const stepsPerBeat = noteDivision / 4
  const defaultDurationBeats = Math.max(MIN_DURATION_BEATS, Math.round(lastNoteDurationRef.current * stepsPerBeat) / stepsPerBeat)
  const totalSteps = totalBeats * stepsPerBeat
  const rollPitches = useMemo(
    () => {
      if (!allTrackMelodyMode && selectedTrack?.instrumentId && isDrumInstrument(selectedTrack.instrumentId)) {
        return DRUM_PITCHES
      }
      return getDynamicPitches(allTrackMelodyMode ? allTrackNotes : selectedTrackNotes)
    },
    [allTrackMelodyMode, allTrackNotes, selectedTrack?.instrumentId, selectedTrackNotes],
  )
  const selectedTempoSection = useMemo(
    () => tempoSections.find((section) => section.id === selectedTempoSectionId) ?? null,
    [selectedTempoSectionId, tempoSections],
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
  const autoMixMarkerSections = useMemo(
    () => autoMixSections
      .filter((section) => section.endBeat > 0 && section.startBeat < totalBeats)
      .sort((left, right) => left.startBeat - right.startBeat),
    [autoMixSections, totalBeats],
  )
  const selectedNotesByPitch = useMemo(() => {
    const notesByPitch = new Map<number, TrackNote[]>()
    ;(allTrackMelodyMode
      ? allTrackNotes
      : selectedTrackNotes.map((note) => ({ ...note, trackId: selectedTrack?.id ?? '' }))).forEach((note) => {
      const pitchNotes = notesByPitch.get(note.pitch) ?? []
      pitchNotes.push(note)
      notesByPitch.set(note.pitch, pitchNotes)
    })
    return notesByPitch
  }, [allTrackMelodyMode, allTrackNotes, selectedTrack?.id, selectedTrackNotes])
  const otherNotesByPitch = useMemo(() => {
    if (allTrackMelodyMode) return new Map<number, OtherNote[]>()
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
  }, [allTrackMelodyMode, project.notesByTrack, project.tracks, selectedTrack?.id])
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

      if (historyBatchDepthRef.current > 0) {
        historyBatchStartRef.current ??= current
      } else if (hasUndoableProjectChange(current, nextProject)) {
        undoStackRef.current = [...undoStackRef.current.slice(-(HISTORY_LIMIT - 1)), current]
        redoStackRef.current = []
        setHistoryVersion((version) => version + 1)
      }
      projectRef.current = nextProject
      return nextProject
    })
  }

  function beginHistoryBatch() {
    if (historyBatchDepthRef.current === 0) {
      historyBatchStartRef.current = projectRef.current
    }
    historyBatchDepthRef.current += 1
  }

  function endHistoryBatch() {
    if (historyBatchDepthRef.current === 0) return

    historyBatchDepthRef.current -= 1
    if (historyBatchDepthRef.current > 0) return

    const startProject = historyBatchStartRef.current
    historyBatchStartRef.current = null
    if (!startProject) return

    setProjectState((current) => {
      if (!hasUndoableProjectChange(startProject, current)) {
        projectRef.current = current
        return current
      }

      undoStackRef.current = [...undoStackRef.current.slice(-(HISTORY_LIMIT - 1)), startProject]
      redoStackRef.current = []
      setHistoryVersion((version) => version + 1)
      projectRef.current = current
      return current
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
    setHistoryVersion((version) => version + 1)
    restoreProject(previousProject)
  }

  function redoProject() {
    const nextProject = redoStackRef.current.at(-1)
    if (!nextProject) return

    redoStackRef.current = redoStackRef.current.slice(0, -1)
    undoStackRef.current = [...undoStackRef.current.slice(-(HISTORY_LIMIT - 1)), projectRef.current]
    setHistoryVersion((version) => version + 1)
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
    activeEditorTabRef.current = activeEditorTab
  }, [activeEditorTab])

  useEffect(() => {
    autoMixPanelOpenRef.current = autoMixPanelOpen
  }, [autoMixPanelOpen])

  useEffect(() => {
    setTempoInput(String(selectedTempoSection?.tempo ?? project.tempo))
  }, [project.tempo, selectedTempoSection?.tempo])

  useEffect(() => {
    if (autoMixSections.length === 0) {
      if (selectedAutoMixSectionId !== null) setSelectedAutoMixSectionId(null)
      return
    }

    if (!selectedAutoMixSectionId || !autoMixSections.some((section) => section.id === selectedAutoMixSectionId)) {
      setSelectedAutoMixSectionId(autoMixSections[0]?.id ?? null)
    }
  }, [autoMixSections, selectedAutoMixSectionId])

  useEffect(() => {
    if (tempoSections.length === 0) {
      if (selectedTempoSectionId !== null) setSelectedTempoSectionId(null)
      return
    }

    if (!selectedTempoSectionId || !tempoSections.some((section) => section.id === selectedTempoSectionId)) {
      setSelectedTempoSectionId(tempoSections[0]?.id ?? null)
    }
  }, [selectedTempoSectionId, tempoSections])

  useEffect(() => {
    const placements = project.patternPlacements ?? []
    if (placements.length === 0) {
      if (selectedTrackPlacementId !== null) setSelectedTrackPlacementId(null)
      return
    }

    if (!selectedTrackPlacementId || !placements.some((placement) => placement.id === selectedTrackPlacementId)) {
      setSelectedTrackPlacementId(placements[0]?.id ?? null)
    }
  }, [project.patternPlacements, selectedTrackPlacementId])

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
    if (
      patternSelectionRef.current?.active ||
      patternRepeatRef.current?.active ||
      noteDragRef.current?.active ||
      lassoSelectionRef.current.active
    ) return

    const selectedNoteIdSetForBox = new Set(selectedNoteIds)
    const selectedNotes = (allTrackMelodyMode ? allTrackNotes : selectedTrackNotes.map((note) => ({ ...note, trackId: selectedTrack?.id ?? '' })))
      .filter((note) => selectedNoteIdSetForBox.has(note.id))
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
  }, [activeEditorTab, allTrackMelodyMode, allTrackNotes, rollPitches, selectedNoteIds, selectedTrack?.id, selectedTrackNotes, stepWidth, stepsPerBeat, totalSteps])

  interactionHandlersRef.current.addAutoMixSection = addAutoMixSection
  interactionHandlersRef.current.togglePlayback = togglePlayback
  interactionHandlersRef.current.copySelectedNotes = copySelectedNotes
  interactionHandlersRef.current.cutSelectedNotes = cutSelectedNotes
  interactionHandlersRef.current.deleteSelectedNote = deleteSelectedNote
  interactionHandlersRef.current.moveDraggedNoteFromPointer = moveDraggedNoteFromPointer
  interactionHandlersRef.current.eraseDraggedCellFromPointer = eraseDraggedCellFromPointer
  interactionHandlersRef.current.eraseRightDraggedCellFromPointer = eraseRightDraggedCellFromPointer
  interactionHandlersRef.current.finishLassoSelection = finishLassoSelection
  interactionHandlersRef.current.finishPatternSelection = finishPatternSelection
  interactionHandlersRef.current.finishPatternRepeat = finishPatternRepeat
  interactionHandlersRef.current.finishKeyboardNote = finishKeyboardNote
  interactionHandlersRef.current.startKeyboardNote = startKeyboardNote
  interactionHandlersRef.current.transposeSelectedNotes = transposeSelectedNotes
  interactionHandlersRef.current.ungroupSelectedPattern = ungroupSelectedPattern
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

        if (event.code === 'KeyU') {
          event.preventDefault()
          interactionHandlersRef.current.ungroupSelectedPattern()
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

      if (
        !isTypingTarget &&
        !event.repeat &&
        event.code === 'KeyC' &&
        (activeEditorTabRef.current === 'automix' || autoMixPanelOpenRef.current)
      ) {
        event.preventDefault()
        interactionHandlersRef.current.addAutoMixSection()
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

      if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
        if (isTypingTarget) {
          return
        }

        event.preventDefault()
        interactionHandlersRef.current.transposeSelectedNotes(event.code === 'ArrowUp' ? 1 : -1)
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
      event.preventDefault()

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
      interactionHandlersRef.current.finishLassoSelection()
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
      releaseRollPointerCapture(event?.pointerId)
      interactionHandlersRef.current.stopHeldPreview()
      endHistoryBatch()

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
    window.addEventListener('pointermove', handlePointerMove, { passive: false })
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
      const now = performance.now()
      const playbackTotalBeats = Math.max(1, totalBeatsRef.current)
      const timeline = playbackTempoTimelineRef.current.length > 0
        ? playbackTempoTimelineRef.current
        : buildTempoTimeline(projectRef.current, playbackTotalBeats)
      const currentBeat = Math.min(
        playbackTotalBeats,
        getBeatAtSecondsFromTimeline(
          timeline,
          playbackStartSecondsRef.current + (now - playbackStartMsRef.current) / 1000,
          playbackTotalBeats,
        ),
      )
      playbackBeatRef.current = currentBeat
      pianoRollRef.current?.style.setProperty(
        '--playhead-left',
        `${Math.min(100, (currentBeat / totalBeatsRef.current) * 100)}%`,
      )
      const roll = pianoRollRef.current
      const userIsEditingRoll =
        Boolean(noteDragRef.current?.active) ||
        Boolean(patternSelectionRef.current?.active) ||
        Boolean(patternRepeatRef.current?.active) ||
        lassoSelectionRef.current.active ||
        eraseRef.current.active ||
        rightEraseRef.current.active

      if (
        roll &&
        totalBeatsRef.current > 0 &&
        !userIsEditingRoll &&
        now - lastPlayheadAutoScrollAtRef.current >= PLAYHEAD_AUTO_SCROLL_THROTTLE_MS
      ) {
        lastPlayheadAutoScrollAtRef.current = now
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

    const nextTempo = clampTempoValue(tempo, project.tempo)
    if (selectedTempoSectionId) {
      updateTempoSection(selectedTempoSectionId, { tempo: nextTempo })
      setTempoInput(String(nextTempo))
      return
    }

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

  function createTrackPlacement(trackId: string, anchorBeat = getCurrentPlaybackBeat()): PatternPlacement {
    const startBeat = clampBeatToSong(snapBeatToGrid(anchorBeat))
    return {
      id: createId('placement'),
      trackId,
      patternId: 'track-content',
      startBeat,
      spanBeats: getTrackSourceEndBeat(projectRef.current, trackId),
    }
  }

  function addTrackPlacement(trackId: string, anchorBeat = getCurrentPlaybackBeat()) {
    const placement = createTrackPlacement(trackId, anchorBeat)
    setSelectedTrackPlacementId(placement.id)
    setActiveEditorTab('arrange')
    selectTrack(trackId)
    setProject((current) => ({
      ...current,
      patternPlacements: [...(current.patternPlacements ?? []), placement],
    }))
  }

  function updateTrackPlacement(placementId: string, updates: Partial<PatternPlacement>) {
    setProject((current) => ({
      ...current,
      patternPlacements: (current.patternPlacements ?? []).map((placement) => (
        placement.id === placementId
          ? {
              ...placement,
              ...updates,
              startBeat: Math.max(0, updates.startBeat ?? placement.startBeat),
              spanBeats: Math.max(MIN_DURATION_BEATS, updates.spanBeats ?? placement.spanBeats),
            }
          : placement
      )),
    }))
  }

  function deleteTrackPlacement(placementId: string) {
    setSelectedTrackPlacementId((current) => (current === placementId ? null : current))
    setProject((current) => ({
      ...current,
      patternPlacements: (current.patternPlacements ?? []).filter((placement) => placement.id !== placementId),
    }))
  }

  function beginTrackPlacementDrag(
    placement: PatternPlacement,
    event: ReactPointerEvent<HTMLElement>,
    type: 'move' | 'resize',
  ) {
    if (event.button !== 0) return
    const laneGrid = event.currentTarget.closest('.arrange-lane-grid')
    if (!(laneGrid instanceof HTMLElement)) return

    event.preventDefault()
    event.stopPropagation()
    beginHistoryBatch()
    setSelectedTrackPlacementId(placement.id)
    selectTrack(placement.trackId)
    trackPlacementDragRef.current = {
      placementId: placement.id,
      startBeat: placement.startBeat,
      startClientX: event.clientX,
      startSpanBeats: placement.spanBeats,
      type,
    }

    const rect = laneGrid.getBoundingClientRect()
    const gridWidth = rect.width
    const handlePointerMove = (moveEvent: PointerEvent) => {
      const drag = trackPlacementDragRef.current
      if (!drag) return
      const deltaBeats = snapBeatToGrid(((moveEvent.clientX - drag.startClientX) / Math.max(1, gridWidth)) * totalBeats)
      if (drag.type === 'move') {
        updateTrackPlacement(drag.placementId, { startBeat: Math.max(0, drag.startBeat + deltaBeats) })
      } else {
        updateTrackPlacement(drag.placementId, { spanBeats: Math.max(MIN_DURATION_BEATS, drag.startSpanBeats + deltaBeats) })
      }
    }
    const stopDragging = () => {
      endHistoryBatch()
      trackPlacementDragRef.current = null
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopDragging)
      window.removeEventListener('pointercancel', stopDragging)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopDragging)
    window.addEventListener('pointercancel', stopDragging)
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
        audioClips: (current.audioClips ?? []).filter((clip) => clip.trackId !== trackId),
        patternPlacements: (current.patternPlacements ?? []).filter((placement) => placement.trackId !== trackId),
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
    if (event.button !== 2) return

    event.preventDefault()
    event.stopPropagation()
    setTrackContextMenu(null)
    setPianoRollContextMenu(null)
    cacheRollPointerGeometry()
    if (options.deleteImmediately) {
      beginHistoryBatch()
    }
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

  function startHeldPreview(pitch: number, velocity = 0.75, instrumentId?: InstrumentId) {
    const previewInstrumentId = instrumentId ?? selectedTrack?.instrumentId
    if (!previewInstrumentId) return

    stopHeldPreview()
    setPressedPitch(pitch)
    const token = previewTokenRef.current
    void startPreviewNote(previewInstrumentId, pitch, velocity).then((preview) => {
      if (token !== previewTokenRef.current) {
        stopPreviewNote(preview)
        return
      }
      heldPreviewRef.current = preview
    })
  }

  function changeHeldPreviewPitch(pitch: number, velocity = 0.75, instrumentId?: InstrumentId) {
    if (!heldPreviewRef.current) {
      startHeldPreview(pitch, velocity, instrumentId)
      return
    }

    if (heldPreviewRef.current.pitch !== pitch) {
      previewTokenRef.current += 1
      disposePreviewNote(heldPreviewRef.current)
      heldPreviewRef.current = null
      setPressedPitch(pitch)
      const token = previewTokenRef.current
      void startPreviewNote(instrumentId ?? selectedTrack?.instrumentId ?? 'gm-0', pitch, velocity).then((preview) => {
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

    const now = performance.now()
    const hasValidTimestamp = typeof eventTimeStamp === 'number' && Number.isFinite(eventTimeStamp)
    const eventTime = hasValidTimestamp && Math.abs(now - eventTimeStamp) < 5000
      ? eventTimeStamp
      : now
    const elapsedMs = Math.max(0, eventTime - playbackStartMsRef.current)
    const playbackTotalBeats = totalBeatsRef.current || totalBeats
    const timeline = playbackTempoTimelineRef.current.length > 0
      ? playbackTempoTimelineRef.current
      : buildTempoTimeline(projectRef.current, playbackTotalBeats)
    return getBeatAtSecondsFromTimeline(
      timeline,
      playbackStartSecondsRef.current + elapsedMs / 1000,
      playbackTotalBeats,
    )
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

    const startBeat = Math.max(0, getPlaybackBeatAtEventTime(eventTimeStamp))
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
      Math.max(0, getPlaybackBeatAtEventTime(eventTimeStamp)),
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
    const { endRow, endStep, startRow, startStep } = getSelectionBounds(selection)
    const startBeat = startStep / stepsPerBeat
    const endBeat = (endStep + 1) / stepsPerBeat
    const notePool = allTrackMelodyMode
      ? allTrackNotes
      : selectedTrackNotes.map((note) => ({ ...note, trackId: selectedTrack?.id ?? '' }))
    const selectedIds = notePool
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
    const notePool = allTrackMelodyMode
      ? allTrackNotes
      : selectedTrackNotes.map((note) => ({ ...note, trackId: selectedTrack?.id ?? '' }))
    if (notePool.length === 0) {
      setSelectedNoteIds([])
      setSelectionBox(null)
      setProject((current) => (
        current.selectedNoteId === null ? current : { ...current, selectedNoteId: null }
      ))
      return
    }

    const selectedIds = notePool.map((note) => note.id)
    setSelectedNoteIds(selectedIds)
    setEditMenuOpen(false)
    closePianoRollContextMenu()
    closeTrackContextMenu()
    cacheRollPointerGeometry()
    updateSelectionBoxFromNotes(notePool)
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

  function getLassoSelectedNotes(points: LassoPoint[]) {
    if (points.length < 3) return []

    const geometry = rollPointerGeometryRef.current
    if (!geometry) return []

    const notePool = allTrackMelodyMode
      ? allTrackNotes
      : selectedTrackNotes.map((note) => ({ ...note, trackId: selectedTrack?.id ?? '' }))

    return notePool
      .filter((note) => {
        const rowIndex = rollPitches.indexOf(note.pitch)
        if (rowIndex < 0) return false

        const noteCenterX = ((note.startBeat + note.durationBeats / 2) / totalBeats) * geometry.gridWidth
        const noteCenterY = (rowIndex + 0.5) * ROLL_ROW_HEIGHT
        return isPointInPolygon(noteCenterX, noteCenterY, points)
      })
  }

  function selectNotesInLasso(points: LassoPoint[]) {
    const selectedNotes = getLassoSelectedNotes(points)
    const selectedIds = selectedNotes.map((note) => note.id)

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

  function finishLassoSelection() {
    const lasso = lassoSelectionRef.current
    if (!lasso.active) return

    const selectedNotes = getLassoSelectedNotes(lasso.points)
    const selectedIds = selectedNotes.map((note) => note.id)
    setSelectedNoteIds(selectedIds)
    if (selectedNotes.length > 0) {
      updateSelectionBoxFromNotes(selectedNotes)
    } else {
      setSelectionBox(null)
    }
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

  function getNoteTrackId(note: Note | TrackNote, fallbackTrackId = selectedTrack?.id ?? '') {
    return 'trackId' in note && typeof note.trackId === 'string' ? note.trackId : fallbackTrackId
  }

  function findEditableNoteAtCell(pitch: number, step: number) {
    const beat = step / stepsPerBeat
    const notePool = allTrackMelodyMode
      ? allTrackNotes
      : selectedTrackNotes.map((note) => ({ ...note, trackId: selectedTrack?.id ?? '' }))
    return notePool.find(
      (note) =>
        note.pitch === pitch &&
        beat >= note.startBeat &&
        beat < note.startBeat + note.durationBeats,
    ) ?? null
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

  function getOutsideEdgeScrollDelta(outsidePixels: number) {
    if (outsidePixels <= 0) return 0
    const normalized = Math.min(1, outsidePixels / NOTE_DRAG_SCROLL_SENSITIVITY_PX)
    return Math.max(1, Math.round(normalized * NOTE_DRAG_SCROLL_MAX_STEP_PX))
  }

  function applyNoteDragAutoScroll(clientX: number, clientY: number) {
    const roll = pianoRollRef.current
    if (!roll) return

    const rect = roll.getBoundingClientRect()
    let deltaX = 0
    let deltaY = 0

    if (clientX < rect.left - NOTE_DRAG_SCROLL_OUTSIDE_THRESHOLD_PX) {
      deltaX = -getOutsideEdgeScrollDelta(
        rect.left - NOTE_DRAG_SCROLL_OUTSIDE_THRESHOLD_PX - clientX,
      )
    } else if (clientX > rect.right + NOTE_DRAG_SCROLL_OUTSIDE_THRESHOLD_PX) {
      deltaX = getOutsideEdgeScrollDelta(
        clientX - (rect.right + NOTE_DRAG_SCROLL_OUTSIDE_THRESHOLD_PX),
      )
    }

    if (clientY < rect.top - NOTE_DRAG_SCROLL_OUTSIDE_THRESHOLD_PX) {
      deltaY = -getOutsideEdgeScrollDelta(
        rect.top - NOTE_DRAG_SCROLL_OUTSIDE_THRESHOLD_PX - clientY,
      )
    } else if (clientY > rect.bottom + NOTE_DRAG_SCROLL_OUTSIDE_THRESHOLD_PX) {
      deltaY = getOutsideEdgeScrollDelta(
        clientY - (rect.bottom + NOTE_DRAG_SCROLL_OUTSIDE_THRESHOLD_PX),
      )
    }

    if (deltaX !== 0) {
      const nextScrollLeft = Math.max(
        0,
        Math.min(roll.scrollWidth - roll.clientWidth, roll.scrollLeft + deltaX),
      )
      roll.scrollLeft = nextScrollLeft
    }
    if (deltaY !== 0) {
      const nextScrollTop = Math.max(
        0,
        Math.min(roll.scrollHeight - roll.clientHeight, roll.scrollTop + deltaY),
      )
      roll.scrollTop = nextScrollTop
    }
  }

  function moveDraggedNoteFromPointer(clientX: number, clientY: number) {
    applyNoteDragAutoScroll(clientX, clientY)
    const cell = getCellFromPointer(clientX, clientY)
    if (!cell || !noteDragRef.current?.active) return
    moveDraggedNoteToCell(cell.pitch, cell.step)
  }

  function moveNoteGroupToCell(drag: NoteDrag, pitch: number, step: number) {
    const pitchStep = getGroupedPitchStep(drag.originalNotes)
    const rawPitchDelta = pitch - drag.originPitch
    const requestedPitchDelta = pitchStep === 1
      ? rawPitchDelta
      : Math.round(rawPitchDelta / pitchStep) * pitchStep
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
      const movedById = new Map(
        originalNotes.map((note) => [
          note.id,
          {
            ...note,
            pitch: note.pitch + pitchDelta,
            startBeat: Math.max(0, Math.min(totalBeats - note.durationBeats, note.startBeat + stepDelta / stepsPerBeat)),
          },
        ]),
      )
      let changed = current.selectedNoteId !== drag.noteId
      const nextNotesByTrack = Object.fromEntries(
        Object.entries(current.notesByTrack).map(([trackId, notes]) => [
          trackId,
          notes.map((note) => {
            const movedNote = movedById.get(note.id)
            if (!movedNote || movedNote.trackId !== trackId) return note
            if (note.pitch === movedNote.pitch && nearlyEqual(note.startBeat, movedNote.startBeat)) return note

            changed = true
            return {
              ...note,
              pitch: movedNote.pitch,
              startBeat: movedNote.startBeat,
            }
          }),
        ]),
      )

      if (!changed) return current

      return {
        ...current,
        selectedNoteId: drag.noteId,
        notesByTrack: nextNotesByTrack,
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

  function captureRollPointer(pointerId: number, element: Element) {
    try {
      if ('setPointerCapture' in element) {
        ;(element as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture(pointerId)
        rollPointerCaptureRef.current = { pointerId, element }
      }
    } catch {
      // ignore
    }
  }

  function releaseRollPointerCapture(pointerId?: number) {
    const capture = rollPointerCaptureRef.current
    if (!capture) return
    if (pointerId !== undefined && capture.pointerId !== pointerId) return
    try {
      if ('releasePointerCapture' in capture.element) {
        ;(capture.element as unknown as { releasePointerCapture: (id: number) => void }).releasePointerCapture(capture.pointerId)
      }
    } catch {
      // ignore
    }
    rollPointerCaptureRef.current = null
  }

  function beginSelectionBoxMove(event: ReactPointerEvent<HTMLSpanElement>) {
    if (event.button !== 0 || selectedPatternNotes.length === 0) return

    const pointerCell = getCellFromPointer(event.clientX, event.clientY)
    if (!pointerCell) return

    event.preventDefault()
    event.stopPropagation()
    captureRollPointer(event.pointerId, event.currentTarget)
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
    beginHistoryBatch()
    noteDragRef.current = {
      active: true,
      grabPitchOffset: pointerCell.pitch - originPitch,
      grabStepOffset: Math.max(0, pointerCell.step - originStep),
      groupNoteIds: selectedPatternNotes.map((note) => note.id),
      noteId: firstNote.id,
      originalNotes: selectedPatternNotes,
      originPitch,
      originStep,
      trackId: firstNote.trackId,
      lastPitch: pointerCell.pitch,
      lastStep: pointerCell.step,
    }
    setDraggingNoteId(firstNote.id)
  }

  function eraseNoteAtCell(pitch: number, step: number) {
    const noteToDelete = findEditableNoteAtCell(pitch, step)

    if (!noteToDelete || erasedNoteIdsRef.current.has(noteToDelete.id)) return false
    const trackId = noteToDelete.trackId
    erasedNoteIdsRef.current.add(noteToDelete.id)
    if (rightClickRollActionRef.current?.active) {
      rightClickRollActionRef.current.deleted = true
    }

    beginHistoryBatch()
    setProject((current) => {
      const nextProject = {
        ...current,
        selectedTrackId: trackId,
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
    const noteTrackId = getNoteTrackId(note, selectedTrack.id)
    const noteGroup = patternRepeatGroupByNoteId.get(note.id) ?? null
    const groupedNoteIds = noteGroup
      ? getPatternRepeatGroupNoteIds(noteGroup).filter((noteId) => allTrackNoteIdSet.has(noteId))
      : null
    const isSelectedNote = selectedNoteIdSet.has(note.id)
    const isPatternMember = isSelectedNote && selectedNoteIds.length > 1
    if (toolMode === 'select' && !isSelectedNote) {
      const nextSelectedIds = groupedNoteIds ?? [note.id]
      setSelectedNoteIds(nextSelectedIds)
      if (nextSelectedIds.length > 1) {
        const selectedIdSet = new Set(nextSelectedIds)
        updateSelectionBoxFromNotes(allTrackNotes.filter((item) => selectedIdSet.has(item.id)))
      } else {
        setSelectionBox(null)
      }
      lastNoteDurationRef.current = note.durationBeats
      setProject((current) =>
        current.selectedNoteId === nextSelectedIds[0] && current.selectedTrackId === noteTrackId
          ? current
          : { ...current, selectedTrackId: noteTrackId, selectedNoteId: nextSelectedIds[0] },
      )
      return
    }

    if (toolMode === 'erase') {
      beginHistoryBatch()
      cacheRollPointerGeometry()
      eraseRef.current = { active: true, lastKey: '' }
      erasedNoteIdsRef.current = new Set([note.id])
      deleteNote(note.id)
      return
    }

    setProject((current) =>
      current.selectedNoteId === note.id && current.selectedTrackId === noteTrackId
        ? current
        : { ...current, selectedTrackId: noteTrackId, selectedNoteId: note.id },
    )
    const effectiveGroupNoteIds = isPatternMember ? selectedNoteIds : (groupedNoteIds ?? [note.id])
    if (!isPatternMember && effectiveGroupNoteIds.length > 0) {
      setSelectedNoteIds(effectiveGroupNoteIds)
      if (effectiveGroupNoteIds.length === 1) {
        setSelectionBox(null)
      } else {
        const selectedIdSet = new Set(effectiveGroupNoteIds)
        updateSelectionBoxFromNotes(allTrackNotes.filter((item) => selectedIdSet.has(item.id)))
      }
    }
    lastNoteDurationRef.current = note.durationBeats
    setDraggingNoteId(note.id)
    cacheRollPointerGeometry()
    const pointerCell = getCellFromPointer(event.clientX, event.clientY)
    const noteStartStep = Math.round(note.startBeat * stepsPerBeat)
    const groupNoteIds = effectiveGroupNoteIds.length > 0 ? effectiveGroupNoteIds : [note.id]
    const groupNoteIdSet = new Set(groupNoteIds)
    const originalNotes = groupNoteIds.length > 1
      ? allTrackNotes.filter((item) => groupNoteIdSet.has(item.id))
      : [{ ...note, trackId: noteTrackId }]
    beginHistoryBatch()
    noteDragRef.current = {
      active: true,
      grabPitchOffset: 0,
      grabStepOffset: getGrabStepOffset(note, pointerCell?.step ?? null),
      groupNoteIds,
      noteId: note.id,
      originalNotes,
      originPitch: note.pitch,
      originStep: noteStartStep,
      trackId: noteTrackId,
      lastPitch: note.pitch,
      lastStep: pointerCell?.step ?? noteStartStep,
    }
    startHeldPreview(note.pitch, note.velocity, projectRef.current.tracks.find((track) => track.id === noteTrackId)?.instrumentId)
  }

  function beginPatternRepeat(event: ReactPointerEvent<HTMLSpanElement>) {
    if (event.button !== 0 || selectedPatternNotes.length === 0 || !selectionBox) return

    event.preventDefault()
    event.stopPropagation()
    const selectedGroup = selectedPatternRepeatGroup
    const selectedGroupNoteIds = selectedGroup ? new Set(selectedGroup.baseNoteIds) : null
    const baseNotes = selectedGroupNoteIds
      ? selectedPatternNotes.filter((note) => selectedGroupNoteIds.has(note.id))
      : selectedPatternNotes
    const baseStartBeat = Math.min(...baseNotes.map((note) => note.startBeat))
    const baseEndBeat = Math.max(...baseNotes.map((note) => note.startBeat + note.durationBeats))
    if (baseEndBeat <= baseStartBeat) return

    const baseRepeatCount = selectedGroup ? selectedGroup.repeats.length + 1 : 1
    const gapBeats = selectedGroup?.gapBeats ?? getCurrentPatternRepeatGapBeats()
    const gapWidth = gapBeats * beatWidth
    const baseWidth = selectedGroup
      ? (selectionBox.width - gapWidth * (baseRepeatCount - 1)) / baseRepeatCount
      : selectionBox.width
    beginHistoryBatch()
    patternRepeatRef.current = {
      active: true,
      baseEndBeat,
      baseStartBeat,
      baseWidth,
      currentWidth: selectionBox.width,
      existingGroupId: selectedGroup?.id ?? null,
      gapBeats,
      notes: baseNotes,
      repeatCount: baseRepeatCount,
      startClientX: event.clientX,
      startRepeatCount: baseRepeatCount,
    }
  }

  function updatePatternRepeatPreview(clientX: number) {
    const repeat = patternRepeatRef.current
    if (!repeat?.active) return

    const gapWidth = repeat.gapBeats * beatWidth
    const unitWidth = Math.max(1, repeat.baseWidth + gapWidth)
    const dragDistance = clientX - repeat.startClientX
    const stepDelta = Math.trunc(dragDistance / unitWidth)
    const nextRepeatCount = Math.max(1, repeat.startRepeatCount + stepDelta)
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
    const currentGroup = repeat.existingGroupId
      ? projectRef.current.patternRepeatGroups?.find((group) => group.id === repeat.existingGroupId) ?? null
      : null
    const currentRepeatCount = currentGroup ? currentGroup.repeats.length + 1 : 1
    if (!currentGroup && repeatCount <= 1) return
    if (currentGroup && repeatCount === currentRepeatCount) return

    const spanBeats = repeat.baseEndBeat - repeat.baseStartBeat
    const repeatStepBeats = spanBeats + repeat.gapBeats
    const nextNotes: TrackNote[] = []
    const nextRepeatNoteIds: string[][] = []
    for (let repeatIndex = currentRepeatCount; repeatIndex < repeatCount; repeatIndex += 1) {
      const beatOffset = repeatStepBeats * repeatIndex
      const repeatNoteIds: string[] = []
      repeat.notes.forEach((note) => {
        const nextNote = {
          ...note,
          id: createId('note'),
          startBeat: snapBeatToGrid(note.startBeat + beatOffset),
        }
        repeatNoteIds.push(nextNote.id)
        nextNotes.push(nextNote)
      })
      nextRepeatNoteIds.push(repeatNoteIds)
    }

    const keptRepeats = currentGroup?.repeats.slice(0, Math.max(0, repeatCount - 1)) ?? []
    const removedNoteIds = new Set(
      currentGroup && repeatCount < currentRepeatCount
        ? currentGroup.repeats.slice(Math.max(0, repeatCount - 1)).flatMap((item) => item.noteIds)
        : [],
    )
    const nextRepeats = [
      ...keptRepeats,
      ...nextRepeatNoteIds.map((noteIds) => ({ noteIds })),
    ]
    const nextSelectedIds = [
      ...repeat.notes.map((note) => note.id),
      ...nextRepeats.flatMap((item) => item.noteIds),
    ]
    const nextSelectionNotes = [
      ...repeat.notes,
      ...allTrackNotes.filter((note) => nextSelectedIds.includes(note.id)),
      ...nextNotes,
    ].filter((note, index, notes) => notes.findIndex((item) => item.id === note.id) === index)
    setSelectedNoteIds(nextSelectedIds)
    updateSelectionBoxFromNotes(nextSelectionNotes)
    setProject((current) => ({
      ...current,
      selectedNoteId: nextSelectedIds[0] ?? current.selectedNoteId,
      notesByTrack: Object.fromEntries(
        Object.entries(current.notesByTrack).map(([trackId, notes]) => [
          trackId,
          [
            ...notes.filter((note) => !removedNoteIds.has(note.id)),
            ...nextNotes
              .filter((note) => note.trackId === trackId)
              .map(toStoredNote),
          ],
        ]),
      ),
      patternRepeatGroups: [
        ...(current.patternRepeatGroups ?? []).filter((group) => group.id !== repeat.existingGroupId),
        ...(nextRepeats.length > 0
          ? [{
              id: currentGroup?.id ?? createId('pattern-group'),
              baseEndBeat: repeat.baseEndBeat,
              baseNoteIds: repeat.notes.map((note) => note.id),
              baseStartBeat: repeat.baseStartBeat,
              gapBeats: repeat.gapBeats,
              repeats: nextRepeats,
            }]
          : []),
      ],
    }))
  }

  function ungroupSelectedPattern() {
    const group = selectedPatternRepeatGroup
    if (!group) return

    setProject((current) => ({
      ...current,
      patternRepeatGroups: (current.patternRepeatGroups ?? []).filter((item) => item.id !== group.id),
    }))
  }

  function getCurrentPatternRepeatGapSteps() {
    const parsed = Math.round(Number(patternRepeatGapInput))
    if (!Number.isFinite(parsed)) return 1
    return Math.max(0, Math.min(512, parsed))
  }

  function getCurrentPatternRepeatGapBeats() {
    return normalizePatternRepeatGapBeats(getCurrentPatternRepeatGapSteps() / stepsPerBeat)
  }

  function commitPatternRepeatGap() {
    const nextGapSteps = getCurrentPatternRepeatGapSteps()
    const nextGapBeats = getCurrentPatternRepeatGapBeats()
    setPatternRepeatGapInput(String(nextGapSteps))
    const group = selectedPatternRepeatGroup
    if (!group) return

    setProject((current) => {
      const nextGroups = (current.patternRepeatGroups ?? []).map((item) => (
        item.id === group.id
          ? { ...item, gapBeats: nextGapBeats }
          : item
      ))
      return { ...current, patternRepeatGroups: nextGroups }
    })
  }

  function beginRightEraseNote(note: Note, event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 2) return
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
      beginHistoryBatch()
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

    const existingNote = findEditableNoteAtCell(pitch, step)
    if (existingNote) {
      const noteTrackId = existingNote.trackId
      const noteGroup = patternRepeatGroupByNoteId.get(existingNote.id) ?? null
      const groupedNoteIds = noteGroup
        ? getPatternRepeatGroupNoteIds(noteGroup).filter((noteId) => allTrackNoteIdSet.has(noteId))
        : [existingNote.id]
      const groupedNoteIdSet = new Set(groupedNoteIds)
      const originalNotes = groupedNoteIds.length > 1
        ? allTrackNotes.filter((note) => groupedNoteIdSet.has(note.id))
        : [existingNote]
      setDraggingNoteId(existingNote.id)
      cacheRollPointerGeometry()
      const existingNoteStartStep = Math.round(existingNote.startBeat * stepsPerBeat)
      beginHistoryBatch()
      noteDragRef.current = {
        active: true,
        grabPitchOffset: 0,
        grabStepOffset: getGrabStepOffset(existingNote, step),
        groupNoteIds: groupedNoteIds,
        noteId: existingNote.id,
        originalNotes,
        originPitch: pitch,
        originStep: existingNoteStartStep,
        trackId: noteTrackId,
        lastPitch: pitch,
        lastStep: step,
      }
      setProject((current) =>
        current.selectedNoteId === existingNote.id && current.selectedTrackId === noteTrackId
          ? current
          : { ...current, selectedTrackId: noteTrackId, selectedNoteId: existingNote.id },
      )
      setSelectedNoteIds(groupedNoteIds)
      if (groupedNoteIds.length > 1) {
        updateSelectionBoxFromNotes(originalNotes)
      } else {
        setSelectionBox(null)
      }
      lastNoteDurationRef.current = existingNote.durationBeats
      startHeldPreview(
        pitch,
        existingNote.velocity,
        projectRef.current.tracks.find((track) => track.id === noteTrackId)?.instrumentId,
      )
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
    beginHistoryBatch()
    noteDragRef.current = {
      active: true,
      grabPitchOffset: 0,
      grabStepOffset: 0,
      groupNoteIds: [note.id],
      noteId: note.id,
      originalNotes: [{ ...note, trackId: selectedTrack.id }],
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
    if (selectedNoteIds.length > 1) {
      deleteSelectedNotes()
      return
    }
    if (!selectedNote) return
    deleteNote(selectedNote.id)
  }

  function deleteSelectedNotes() {
    if (selectedNoteIds.length === 0) return

    const idsToDelete = new Set(selectedNoteIds)
    setSelectedNoteIds([])
    setSelectionBox(null)
    setProject((current) => ({
      ...current,
      selectedNoteId: null,
      notesByTrack: Object.fromEntries(
        Object.entries(current.notesByTrack).map(([trackId, notes]) => [
          trackId,
          notes.filter((note) => !idsToDelete.has(note.id)),
        ]),
      ),
      patternRepeatGroups: prunePatternRepeatGroups(current.patternRepeatGroups, idsToDelete),
    }))
  }

  function transposeSelectedNotes(direction: -1 | 1) {
    if (editableSelectedNotes.length === 0) return

    const pitchStep = getGroupedPitchStep(editableSelectedNotes)
    const pitchDelta = direction * pitchStep
    const targetIds = new Set(editableSelectedNotes.map((note) => note.id))
    const targetNotes = allTrackNotes.filter((note) => targetIds.has(note.id))
    if (targetNotes.length === 0) return

    const minNextPitch = Math.min(...targetNotes.map((note) => note.pitch + pitchDelta))
    const maxNextPitch = Math.max(...targetNotes.map((note) => note.pitch + pitchDelta))
    if (minNextPitch < 0 || maxNextPitch > 127) return

    setProject((current) => ({
      ...current,
      notesByTrack: Object.fromEntries(
        Object.entries(current.notesByTrack).map(([trackId, notes]) => [
          trackId,
          notes.map((note) => (
            targetIds.has(note.id)
              ? { ...note, pitch: note.pitch + pitchDelta }
              : note
          )),
        ]),
      ),
    }))
  }

  function deleteNote(noteId: string) {
    setSelectedNoteIds((current) => current.filter((id) => id !== noteId))
    setSelectionBox(null)
    setProject((current) => ({
      ...current,
      selectedNoteId: current.selectedNoteId === noteId ? null : current.selectedNoteId,
      notesByTrack: Object.fromEntries(
        Object.entries(current.notesByTrack).map(([trackId, notes]) => [
          trackId,
          notes.filter((note) => note.id !== noteId),
        ]),
      ),
      patternRepeatGroups: prunePatternRepeatGroups(current.patternRepeatGroups, new Set([noteId])),
    }))
  }

  function getNoteControlValue(
    note: Note,
    key: EditableNoteControlKey,
  ) {
    const fallback = key === 'pan' || key === 'pitchBend' ? 0 : 1
    return Number(note[key] ?? fallback)
  }

  function clampNoteControlValue(
    key: EditableNoteControlKey,
    rawValue: number,
  ) {
    if (key === 'pitchBend') return Math.max(-2, Math.min(2, rawValue))
    if (key === 'pan') return Math.max(-1, Math.min(1, rawValue))
    if (key === 'velocity') return Math.max(0.05, Math.min(1, rawValue))
    return Math.max(0, Math.min(1, rawValue))
  }

  function quantizeValue(value: number, step: number) {
    if (!Number.isFinite(step) || step <= 0) return value
    return Math.round(value / step) * step
  }

  function getSelectedNoteValue(key: EditableNoteControlKey) {
    if (editableSelectedNotes.length === 0) return key === 'pan' || key === 'pitchBend' ? 0 : 1

    return editableSelectedNotes.reduce((total, note) => total + getNoteControlValue(note, key), 0) / editableSelectedNotes.length
  }

  function updateSingleNoteControlValue(
    noteId: string,
    key: EditableNoteControlKey,
    value: number,
  ) {
    const clamped = clampNoteControlValue(key, value)
    setProject((current) => {
      let changed = false
      const nextNotesByTrack = Object.fromEntries(
        Object.entries(current.notesByTrack).map(([trackId, notes]) => [
          trackId,
          notes.map((note) => {
            if (note.id !== noteId) return note
            const currentValue = getNoteControlValue(note, key)
            if (nearlyEqual(currentValue, clamped)) return note
            changed = true
            return { ...note, [key]: clamped }
          }),
        ]),
      )

      return changed
        ? { ...current, notesByTrack: nextNotesByTrack }
        : current
    })
  }

  function updateDetailGraphSegmentValues(
    key: EditableNoteControlKey,
    noteIds: string[],
    beatA: number,
    valueA: number,
    beatB: number,
    valueB: number,
    min: number,
    max: number,
    step: number,
  ) {
    const segmentStartBeat = Math.min(beatA, beatB)
    const segmentEndBeat = Math.max(beatA, beatB)
    const segmentSpan = Math.max(0.0001, segmentEndBeat - segmentStartBeat)
    const updates = new Map<string, number>()

    noteIds.forEach((noteId) => {
      const note = allTrackNotesById.get(noteId)
      if (!note) return
      if (note.startBeat < segmentStartBeat || note.startBeat > segmentEndBeat) return
      const ratio = (note.startBeat - segmentStartBeat) / segmentSpan
      const rawValue = beatA <= beatB
        ? valueA + (valueB - valueA) * ratio
        : valueB + (valueA - valueB) * ratio
      const quantized = quantizeValue(rawValue, step)
      updates.set(noteId, Math.max(min, Math.min(max, quantized)))
    })

    if (updates.size === 0) return

    setProject((current) => {
      let changed = false
      const nextNotesByTrack = Object.fromEntries(
        Object.entries(current.notesByTrack).map(([trackId, notes]) => [
          trackId,
          notes.map((note) => {
            const nextValue = updates.get(note.id)
            if (nextValue === undefined) return note
            const currentValue = getNoteControlValue(note, key)
            if (nearlyEqual(currentValue, nextValue)) return note
            changed = true
            return { ...note, [key]: nextValue }
          }),
        ]),
      )
      return changed ? { ...current, notesByTrack: nextNotesByTrack } : current
    })
  }

  function updateDetailGraphFromPointer(clientX: number, clientY: number) {
    const drag = detailGraphDragRef.current
    const svg = detailGraphSvgRef.current
    if (!drag?.active || !svg) return

    const rect = svg.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const normalizedX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const normalizedY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    const beatSpan = Math.max(0.25, drag.maxBeat - drag.minBeat)
    const targetBeat = drag.minBeat + normalizedX * beatSpan
    const nearestNoteId = drag.noteIds.reduce((nearest, noteId) => {
      const note = allTrackNotesById.get(noteId)
      if (!note) return nearest
      if (!nearest) return noteId
      const nearestNote = allTrackNotesById.get(nearest)
      if (!nearestNote) return noteId
      return Math.abs(note.startBeat - targetBeat) < Math.abs(nearestNote.startBeat - targetBeat)
        ? noteId
        : nearest
    }, '' as string)
    if (!nearestNoteId) return

    const rawValue = drag.max - normalizedY * (drag.max - drag.min)
    const quantizedValue = clampNoteControlValue(drag.key, quantizeValue(rawValue, drag.step))

    if (!drag.hasLast) {
      updateSingleNoteControlValue(nearestNoteId, drag.key, quantizedValue)
      drag.lastBeat = targetBeat
      drag.lastValue = quantizedValue
      drag.hasLast = true
      return
    }

    updateDetailGraphSegmentValues(
      drag.key,
      drag.noteIds,
      drag.lastBeat,
      drag.lastValue,
      targetBeat,
      quantizedValue,
      drag.min,
      drag.max,
      drag.step,
    )
    drag.lastBeat = targetBeat
    drag.lastValue = quantizedValue
  }

  function finishDetailGraphDrag(pointerId?: number) {
    const drag = detailGraphDragRef.current
    if (!drag?.active) return
    if (pointerId !== undefined && drag.pointerId !== pointerId) return

    const svg = detailGraphSvgRef.current
    if (svg?.hasPointerCapture(drag.pointerId)) {
      svg.releasePointerCapture(drag.pointerId)
    }
    detailGraphDragRef.current = null
  }

  function beginDetailGraphDrag(
    event: ReactPointerEvent<SVGElement>,
    control: { key: EditableNoteControlKey; min: number; max: number; step: number },
    notes: Note[],
  ) {
    const svg = detailGraphSvgRef.current
    if (!svg || notes.length === 0) return

    event.preventDefault()
    event.stopPropagation()
    svg.setPointerCapture(event.pointerId)
    const minBeat = Math.min(...notes.map((note) => note.startBeat))
    const maxBeat = Math.max(...notes.map((note) => note.startBeat + note.durationBeats))
    const noteIds = [...notes]
      .sort((left, right) => left.startBeat - right.startBeat || left.pitch - right.pitch)
      .map((note) => note.id)
    detailGraphDragRef.current = {
      active: true,
      hasLast: false,
      key: control.key,
      lastBeat: minBeat,
      lastValue: clampNoteControlValue(control.key, quantizeValue(getSelectedNoteValue(control.key), control.step)),
      max: control.max,
      maxBeat,
      min: control.min,
      minBeat,
      noteIds,
      pointerId: event.pointerId,
      step: control.step,
    }
    updateDetailGraphFromPointer(event.clientX, event.clientY)
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
    beginHistoryBatch()
    setFromClientY(event.clientY)

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setFromClientY(moveEvent.clientY)
    }
    const stop = () => {
      endHistoryBatch()
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }

  function updateNoteEvent(noteId: string, updates: Partial<Pick<Note, 'pitch' | 'startBeat' | 'durationBeats' | 'velocity'>>) {
    setProject((current) => {
      let changed = false
      const nextNotesByTrack = Object.fromEntries(
        Object.entries(current.notesByTrack).map(([trackId, notes]) => [
          trackId,
          notes.map((note) => {
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
          }),
        ]),
      )

      return changed
        ? {
            ...current,
            selectedNoteId: noteId,
            notesByTrack: nextNotesByTrack,
          }
        : current
    })
  }

  function resizeNote(targetNote: Note | TrackNote, durationBeats: number) {
    const trackId = getNoteTrackId(targetNote)
    if (!trackId) return

    setProject((current) => {
      const currentNotes = current.notesByTrack[trackId] ?? []
      let changed = current.selectedNoteId !== targetNote.id
      const nextNotes = currentNotes.map((note) => {
        if (note.id !== targetNote.id) return note

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
        selectedNoteId: targetNote.id,
        notesByTrack: {
          ...current.notesByTrack,
          [trackId]: nextNotes,
        },
      }
    })
  }

  function startResizingNote(note: Note | TrackNote, event: ReactPointerEvent<HTMLSpanElement>) {
    const row = event.currentTarget.closest('.step-row')
    if (!(row instanceof HTMLElement)) return

    event.preventDefault()
    event.stopPropagation()
    setResizingNoteId(note.id)
    beginHistoryBatch()
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
      resizeNote(note, endBeat - note.startBeat)
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
      endHistoryBatch()
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
    const tempoAtStart = getTempoAtBeat(projectRef.current, startBeat, totalBeats)
    const durationBeats = Math.max(MIN_DURATION_BEATS, resolvedDurationSeconds / (60 / tempoAtStart))
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
    const tempoAtStart = getTempoAtBeat(projectRef.current, startBeat, totalBeats)
    const durationBeats = Math.max(MIN_DURATION_BEATS, resolvedDurationSeconds / (60 / tempoAtStart))
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

  function focusTrackAtBeat(trackId: string, beat: number) {
    selectTrack(trackId)
    setActiveEditorTab('piano-roll')
    seekPlayback(beat)
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

  function createAutoMixSection(current: Project, anchorBeat = playbackBeat): AutoMixSection {
    const startBeat = Math.max(0, Math.floor(anchorBeat / BEATS_PER_BAR) * BEATS_PER_BAR)
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

  function createFullSongAutoMixSection(current: Project): AutoMixSection {
    const projectEnd = Math.max(
      DEFAULT_PROJECT_LENGTH_BEATS,
      getNotesEndBeat(current.notesByTrack),
      (current.audioClips ?? []).reduce((latest, clip) => Math.max(latest, clip.startBeat + clip.durationBeats), 0),
    )

    return {
      id: createId('automix'),
      name: '전체 구간',
      startBeat: 0,
      endBeat: Math.max(BEATS_PER_BAR, projectEnd),
      intensity: 0.7,
      priorities: Object.fromEntries(
        current.tracks.map((track) => [track.id, getDefaultAutoMixPriority(track)]),
      ),
    }
  }

  function getAutoMixGenrePriority(track: Track, genre: AutoMixGenrePreset) {
    const role = getAutoMixRole(track)
    const trackName = track.name.toLowerCase()
    const isAudioTrack = track.kind === 'audio' || track.instrumentId === 'audio-track'

    if (genre === 'default') return getDefaultAutoMixPriority(track)

    if (genre === 'ballad') {
      if (isAudioTrack || role === '주요 선율' || role === '중심 악기') return 5
      if (role === '배경 선율' || role === '보조 선율') return 4
      if (role === '리듬 중심' || role === '저음 받침') return 3
      return 3
    }

    if (genre === 'rock') {
      if (isDrumInstrument(track.instrumentId) || role === '저음 받침') return 5
      if (trackName.includes('guitar') || trackName.includes('기타') || role === '리듬 악기') return 4
      if (role === '주요 선율' || role === '중심 악기') return 4
      return 3
    }

    if (genre === 'hiphop') {
      if (isDrumInstrument(track.instrumentId) || role === '저음 받침') return 5
      if (isAudioTrack || role === '신스 선율' || role === '중심 악기') return 4
      return 3
    }

    if (genre === 'edm') {
      if (isDrumInstrument(track.instrumentId) || role === '저음 받침' || role === '신스 선율') return 5
      if (role === '주요 선율' || role === '리듬 악기') return 4
      if (role === '공간 배경') return 2
      return 3
    }

    if (genre === 'orchestra') {
      if (trackName.includes('violin') || trackName.includes('strings') || role === '주요 선율') return 5
      if (trackName.includes('brass') || role === '배경 선율' || role === '보조 선율') return 4
      if (isDrumInstrument(track.instrumentId)) return 3
      return 4
    }

    return getDefaultAutoMixPriority(track)
  }

  function applyAutoMixGenrePreset(nextGenre: AutoMixGenrePreset) {
    setAutoMixGenrePreset(nextGenre)
    setAutoMixPanelOpen(true)
    setProject((current) => {
      const sections = (current.autoMixSections ?? []).length > 0
        ? current.autoMixSections ?? []
        : [createFullSongAutoMixSection(current)]

      const nextSections = sections.map((section) => {
        const focusTrackId = getAutoMixFocusTrackId(section)
        return {
          ...section,
          priorities: Object.fromEntries(
            current.tracks.map((track) => [
              track.id,
              track.id === focusTrackId
                ? 5
                : getAutoMixGenrePriority(track, nextGenre),
            ]),
          ),
        }
      })

      return {
        ...current,
        autoMixSections: nextSections,
      }
    })
  }

  function focusAutoMixSection(sectionId: string) {
    setSelectedAutoMixSectionId(sectionId)
    setAutoMixPanelOpen(true)
  }

  function addAutoMixSection() {
    setAutoMixPanelOpen(true)
    setProject((current) => {
      const nextSection = createAutoMixSection(current)
      setSelectedAutoMixSectionId(nextSection.id)
      return {
        ...current,
        autoMixSections: [...(current.autoMixSections ?? []), nextSection],
      }
    })
  }

  function addAutoMixSectionAtBeat(anchorBeat: number) {
    setAutoMixPanelOpen(true)
    setProject((current) => {
      const nextSection = createAutoMixSection(current, anchorBeat)
      setSelectedAutoMixSectionId(nextSection.id)
      return {
        ...current,
        autoMixSections: [...(current.autoMixSections ?? []), nextSection],
      }
    })
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
    if (selectedAutoMixSectionId === sectionId) {
      setSelectedAutoMixSectionId(null)
    }
    setProject((current) => ({
      ...current,
      autoMixSections: (current.autoMixSections ?? []).filter((section) => section.id !== sectionId),
    }))
  }

  function createTempoSection(anchorBeat = getCurrentPlaybackBeat()): TempoSection {
    const startBeat = Math.max(0, Math.floor(anchorBeat / BEATS_PER_BAR) * BEATS_PER_BAR)
    const endBeat = Math.min(
      totalBeats,
      Math.max(startBeat + BEATS_PER_BAR, startBeat + BEATS_PER_BAR * TEMPO_SECTION_DEFAULT_BARS),
    )

    return {
      id: createId('tempo'),
      name: `빠르기 구간 ${tempoSections.length + 1}`,
      startBeat,
      endBeat,
      tempo: Math.round(getTempoAtBeat(projectRef.current, startBeat, totalBeats)),
    }
  }

  function addTempoSection(anchorBeat = getCurrentPlaybackBeat()) {
    setProject((current) => {
      const nextSection = createTempoSection(anchorBeat)
      setSelectedTempoSectionId(nextSection.id)
      return {
        ...current,
        tempoSections: [...(current.tempoSections ?? []), nextSection],
      }
    })
  }

  function updateTempoSection(sectionId: string, updates: Partial<TempoSection>) {
    setProject((current) => {
      const sortedSections = [...(current.tempoSections ?? [])].sort((left, right) => left.startBeat - right.startBeat)
      const sectionIndex = sortedSections.findIndex((section) => section.id === sectionId)
      const previousSection = sectionIndex > 0 ? sortedSections[sectionIndex - 1] : null
      const nextSection = sectionIndex >= 0 && sectionIndex < sortedSections.length - 1 ? sortedSections[sectionIndex + 1] : null
      const minStartBeat = previousSection?.endBeat ?? 0
      const maxEndBeat = nextSection?.startBeat ?? totalBeats

      return {
        ...current,
        tempoSections: (current.tempoSections ?? []).map((section) => {
          if (section.id !== sectionId) return section

          const nextStartBeat = Math.max(
            minStartBeat,
            Math.min(maxEndBeat - 0.25, updates.startBeat ?? section.startBeat),
          )
          const nextEndBeat = Math.max(
            nextStartBeat + 0.25,
            Math.min(maxEndBeat, updates.endBeat ?? section.endBeat),
          )

          return {
            ...section,
            ...updates,
            startBeat: nextStartBeat,
            endBeat: nextEndBeat,
            tempo: clampTempoValue(updates.tempo ?? section.tempo, current.tempo),
          }
        }),
      }
    })
  }

  function deleteTempoSection(sectionId: string) {
    if (selectedTempoSectionId === sectionId) {
      setSelectedTempoSectionId(null)
    }
    setProject((current) => ({
      ...current,
      tempoSections: (current.tempoSections ?? []).filter((section) => section.id !== sectionId),
    }))
  }

  function focusTempoSection(sectionId: string) {
    setSelectedTempoSectionId(sectionId)
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

  function getBeatFromHorizontalPointer(event: ReactPointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width)
    return (x / rect.width) * totalBeats
  }

  function addAutoMixSectionFromPointer(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest('.automix-cut-marker')) return
    event.preventDefault()
    addAutoMixSectionAtBeat(getBeatFromHorizontalPointer(event))
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

  function setPlaybackKeyPressedClass(rawPitch: number, pressed: boolean) {
    const pitch = Math.max(0, Math.min(127, Math.round(rawPitch)))
    pianoRollRef.current
      ?.querySelectorAll<HTMLButtonElement>(`.piano-key[data-pitch="${pitch}"]`)
      .forEach((key) => key.classList.toggle('is-playback-pressed', pressed))
  }

  function markPlaybackPitchPressed(rawPitch: number) {
    const pitch = Math.max(0, Math.min(127, Math.round(rawPitch)))
    const counts = playbackPressedPitchCountsRef.current
    const nextCount = (counts.get(pitch) ?? 0) + 1
    counts.set(pitch, nextCount)
    if (nextCount === 1) {
      setPlaybackKeyPressedClass(pitch, true)
    }
  }

  function markPlaybackPitchReleased(rawPitch: number) {
    const pitch = Math.max(0, Math.min(127, Math.round(rawPitch)))
    const counts = playbackPressedPitchCountsRef.current
    const currentCount = counts.get(pitch) ?? 0

    if (currentCount <= 1) {
      counts.delete(pitch)
      setPlaybackKeyPressedClass(pitch, false)
    } else {
      counts.set(pitch, currentCount - 1)
    }
  }

  function clearPlaybackPressedKeys() {
    pianoRollRef.current
      ?.querySelectorAll<HTMLButtonElement>('.piano-key.is-playback-pressed')
      .forEach((key) => key.classList.remove('is-playback-pressed'))
    playbackPressedPitchCountsRef.current.clear()
  }

  function disposePlaybackVoices() {
    playbackSessionRef.current += 1
    silenceAllAudioOutput()
    stopPreviewNoteImmediately(heldPreviewRef.current)
    heldPreviewRef.current = null
    stopAllPreviewAudio()
    keyPreviewRef.current.active = false
    keyboardRecordingRef.current.forEach((recording) => {
      if (recording.liveNoteInput === null) return
      const track = activePlaybackTracksRef.current.find((item) => item.id === recording.trackId)
      track?.instrument.triggerRelease(recording.liveNoteInput, Tone.now())
    })
    keyboardRecordingRef.current.clear()
    setPressedPitch(null)
    clearPlaybackPressedKeys()
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
    playbackTempoTimelineRef.current = []
    playbackStartSecondsRef.current = 0
    lastPlayheadAutoScrollAtRef.current = 0
    setIsPlaying(false)
  }

  function schedulePlaybackNote(
    track: ActivePlaybackTrack,
    note: Note,
    currentBeat: number,
    sessionId: number,
  ) {
    const timeline = playbackTempoTimelineRef.current.length > 0
      ? playbackTempoTimelineRef.current
      : buildTempoTimeline(projectRef.current, totalBeats)
    const offsetBeat = Math.max(0, currentBeat - note.startBeat)
    const playbackStartBeat = note.startBeat + offsetBeat
    const playbackEndBeat = note.startBeat + note.durationBeats
    const remainingDurationSeconds = Math.max(
      0.04,
      getSecondsBetweenBeatsFromTimeline(timeline, playbackStartBeat, playbackEndBeat),
    )
    const delayMs = Math.max(
      0,
      (getSecondsAtBeatFromTimeline(timeline, note.startBeat) - getSecondsAtBeatFromTimeline(timeline, currentBeat)) * 1000,
    )
    const noteInput = track.instrument.expectsMidi
      ? note.pitch
      : Tone.Frequency(note.pitch, 'midi').toFrequency()

    const notePitch = note.pitch
    const startTimeoutId = window.setTimeout(() => {
      if (sessionId !== playbackSessionRef.current) return
      markPlaybackPitchPressed(notePitch)

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
    const releaseTimeoutId = window.setTimeout(() => {
      if (sessionId !== playbackSessionRef.current) return
      markPlaybackPitchReleased(notePitch)
    }, Math.ceil(delayMs + remainingDurationSeconds * 1000))
    activeTimeoutsRef.current.push(releaseTimeoutId)
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
    const timeline = playbackTempoTimelineRef.current.length > 0
      ? playbackTempoTimelineRef.current
      : buildTempoTimeline(currentProject, totalBeats)
    ;(currentProject.audioClips ?? []).forEach((clip) => {
      const track = currentProject.tracks.find((item) => item.id === clip.trackId)
      if (!track || track.mute) return
      if (clip.startBeat + clip.durationBeats <= startBeat) return

      const clipOffsetSeconds = Math.max(
        0,
        getSecondsBetweenBeatsFromTimeline(timeline, clip.startBeat, Math.min(startBeat, clip.startBeat + clip.durationBeats)),
      )
      const delayMs = Math.max(
        0,
        (getSecondsAtBeatFromTimeline(timeline, clip.startBeat) - getSecondsAtBeatFromTimeline(timeline, startBeat)) * 1000,
      )
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
            const clipDurationSeconds = getSecondsBetweenBeatsFromTimeline(timeline, clip.startBeat, clip.startBeat + clip.durationBeats)
            const playDurationSeconds = Math.min(buffer.duration - clipOffsetSeconds, clipDurationSeconds - clipOffsetSeconds)
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
    const playbackTotalBeats = totalBeatsRef.current || totalBeats
    const timeline = playbackTempoTimelineRef.current.length > 0
      ? playbackTempoTimelineRef.current
      : buildTempoTimeline(projectRef.current, playbackTotalBeats)
    return Math.min(
      playbackTotalBeats,
      getBeatAtSecondsFromTimeline(timeline, playbackStartSecondsRef.current + elapsedMs / 1000, playbackTotalBeats),
    )
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
    const arrangedPlaybackProject = expandProjectForArrangement(currentProject)
    const playbackTimeline = buildTempoTimeline(currentProject, totalBeats)
    playbackTempoTimelineRef.current = playbackTimeline
    playbackStartSecondsRef.current = getSecondsAtBeatFromTimeline(playbackTimeline, safeStartBeat)

    arrangedPlaybackProject.tracks.forEach((track) => {
      if (track.mute) return

      const notes = (arrangedPlaybackProject.notesByTrack[track.id] ?? [])
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
    schedulePlaybackAudioClips(arrangedPlaybackProject, safeStartBeat, sessionId)
    schedulePlaybackWindow(safeStartBeat)
    activeIntervalsRef.current.push(
      window.setInterval(() => {
        schedulePlaybackWindow(getLivePlaybackBeat())
      }, PLAYBACK_SCHEDULER_MS),
    )
    activeTimeoutsRef.current.push(
      window.setTimeout(
        resetPlayback,
        Math.ceil(getSecondsBetweenBeatsFromTimeline(playbackTimeline, safeStartBeat, totalBeats) * 1000) + 2200,
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

  function renderTempoSectionOverlay() {
    if (tempoSections.length === 0) return null

    return (
      <div className="tempo-section-overlay" aria-label="빠르기 구간 표시">
        {tempoSections.map((section, index) => {
          const left = Math.min(100, Math.max(0, (section.startBeat / totalBeats) * 100))
          const right = Math.min(100, Math.max(0, (section.endBeat / totalBeats) * 100))
          const width = Math.max(1.2, right - left)
          const isSelected = section.id === selectedTempoSection?.id

          return (
            <button
              type="button"
              className={isSelected ? 'tempo-section-marker is-selected' : 'tempo-section-marker'}
              key={section.id}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`${section.name} · ${section.tempo} BPM`}
              onPointerDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
                focusTempoSection(section.id)
              }}
            >
              <strong>{section.name || `빠르기 ${index + 1}`}</strong>
              <span>{section.tempo} BPM</span>
            </button>
          )
        })}
      </div>
    )
  }

  function renderAutoMixCutOverlay() {
    if (autoMixMarkerSections.length === 0) return null

    return (
      <div className="automix-cut-overlay" aria-label="자동 믹스 컷 표시">
        {autoMixMarkerSections.map((section, index) => {
          const left = Math.min(100, Math.max(0, (section.startBeat / totalBeats) * 100))
          const right = Math.min(100, Math.max(0, (section.endBeat / totalBeats) * 100))
          const width = Math.max(0.8, right - left)
          const isSelected = section.id === selectedAutoMixSection?.id

          return (
            <button
              type="button"
              className={isSelected ? 'automix-cut-marker is-selected' : 'automix-cut-marker'}
              key={section.id}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`${section.name} · ${Math.round(section.intensity * 100)}%`}
              onPointerDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
                focusAutoMixSection(section.id)
              }}
            >
              <strong>{section.name || `컷 ${index + 1}`}</strong>
              <span>{Math.floor(section.startBeat / BEATS_PER_BAR) + 1} ~ {Math.ceil(section.endBeat / BEATS_PER_BAR)}</span>
            </button>
          )
        })}
      </div>
    )
  }

  const activeNoteControl = (() => {
    if (activeDetailTerm === '소리 세기') {
      return { key: 'velocity' as const, label: '소리 세기', min: 0.05, max: 1, step: 0.01, format: (value: number) => `${Math.round(value * 100)}` }
    }
    if (activeDetailTerm === '음높이 휘기') {
      return { key: 'pitchBend' as const, label: '음높이 휘기', min: -2, max: 2, step: 0.1, format: (value: number) => value.toFixed(1) }
    }
    if (activeDetailTerm === '음량') {
      return { key: 'volume' as const, label: '음량', min: 0, max: 1, step: 0.01, format: (value: number) => `${Math.round(value * 100)}` }
    }
    if (activeDetailTerm === '좌우 위치') {
      return { key: 'pan' as const, label: '좌우 위치', min: -1, max: 1, step: 0.01, format: (value: number) => `${Math.round(value * 100)}` }
    }
    if (activeDetailTerm === '연주 느낌') {
      return { key: 'expression' as const, label: '연주 느낌', min: 0, max: 1, step: 0.01, format: (value: number) => `${Math.round(value * 100)}` }
    }
    if (activeDetailTerm === '떨림') {
      return { key: 'modulation' as const, label: '떨림', min: 0, max: 1, step: 0.01, format: (value: number) => `${Math.round(value * 100)}` }
    }
    return null
  })()
  const detailGraphNotes = activeNoteControl
    ? sortedEditableSelectedNotes.slice(0, 128).map((note) => ({ ...note }))
    : []
  const detailGraphBounds = detailGraphNotes.length > 0
    ? {
        maxBeat: Math.max(...detailGraphNotes.map((note) => note.startBeat + note.durationBeats)),
        minBeat: Math.min(...detailGraphNotes.map((note) => note.startBeat)),
      }
    : null

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
              <span>파일</span>
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
              <span>편집</span>
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
          <label className="track-mode-toggle">
            <input
              type="checkbox"
              checked={allTrackMelodyMode}
              onChange={(event) => setAllTrackMelodyMode(event.target.checked)}
            />
            <span>전체 트랙 멜로디 편집</span>
          </label>

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
                  <span className="automix-track-icon-stack" aria-hidden="true">
                    <img alt="" draggable={false} src="/instrument-icons/fx.svg" />
                    <i />
                  </span>
                  <span className="automix-track-copy">
                    <strong>{isAutoMixing ? '자동 믹스 진행 중' : 'AutoMix'}</strong>
                    <small>트랙 밸런스와 좌우 위치 자동 정리</small>
                  </span>
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
                  <div className="automix-preset-row">
                    <label>
                      <span>장르 추천</span>
                      <select
                        value={autoMixGenrePreset}
                        onChange={(event) => applyAutoMixGenrePreset(event.target.value as AutoMixGenrePreset)}
                      >
                        {AUTO_MIX_GENRE_PRESETS.map((preset) => (
                          <option key={preset.id} value={preset.id}>{preset.label}</option>
                        ))}
                      </select>
                    </label>
                    <button type="button" onPointerDown={() => applyAutoMixGenrePreset(autoMixGenrePreset)}>
                      추천 적용
                    </button>
                  </div>
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
                    <button type="button" onPointerDown={addAutoMixSection}>＋ 컷 추가 (C)</button>
                  </div>
                  {(project.autoMixSections ?? []).length === 0 ? (
                    <p>컷을 추가하고 그 구간에서 가장 중요한 트랙만 고르면 자동 믹스가 나머지를 알아서 뒤로 보냅니다.</p>
                  ) : (
                    (project.autoMixSections ?? []).map((section) => (
                      <article className={section.id === selectedAutoMixSection?.id ? 'automix-section is-selected' : 'automix-section'} key={section.id}>
                        <div className="automix-section-top">
                          <input
                            aria-label="구간 이름"
                            value={section.name}
                            onFocus={() => focusAutoMixSection(section.id)}
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
                        <div className="automix-cut-preview" onPointerDown={() => focusAutoMixSection(section.id)}>
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
            <div
              className="piano-roll audio-roll"
              ref={pianoRollRef}
              style={rollShellStyle}
            >
              <div className="corner-cell">오디오</div>
              <div
                className="measure-row"
                style={rollTimelineStyle}
                onPointerDown={seekPlaybackFromTimeline}
              >
                <span className="timeline-seek-fill" aria-hidden="true" />
                <span className="timeline-seek-handle" aria-hidden="true" />
                {renderAutoMixCutOverlay()}
                {Array.from({ length: visibleBars }, (_, bar) => (
                  <div className="measure-cell" key={bar}>
                    {bar + 1}
                  </div>
                ))}
              </div>
              <div className="audio-roll-label">
                <strong>{selectedTrack?.name ?? '오디오 트랙'}</strong>
                <span>클립을 위아래로 드래그하면 볼륨이 바뀌고, 배치 탭에서는 전체 구성을 함께 볼 수 있습니다.</span>
              </div>
              <div className="audio-roll-grid">
                <div className="audio-roll-lane">
                  {selectedAudioClips.length > 0 ? selectedAudioClips.map((clip) => (
                    <button
                      type="button"
                      className="audio-roll-clip"
                      key={clip.id}
                      title={`${clip.name} · 볼륨 ${Math.round(clip.volume * 100)}`}
                      style={{
                        left: `${(clip.startBeat / totalBeats) * 100}%`,
                        width: `${Math.max(4, (clip.durationBeats / totalBeats) * 100)}%`,
                      }}
                      onPointerDown={(event) => adjustAudioClipVolumeFromPointer(clip, event)}
                    >
                      <span className="audio-roll-waveform" aria-hidden="true">
                        {(clip.waveform?.length ? clip.waveform : Array.from({ length: 48 }, () => 0.25)).slice(0, 48).map((peak, index) => (
                          <i
                            key={index}
                            style={{ height: `${Math.max(12, Math.min(100, peak * clip.volume * 100))}%` }}
                          />
                        ))}
                      </span>
                      <span className="audio-roll-meta">
                        <strong>{clip.name}</strong>
                        <em>볼륨 {Math.round(clip.volume * 100)}</em>
                      </span>
                    </button>
                  )) : (
                    <div className="audio-track-empty">
                      <strong>오디오 파일이 없습니다</strong>
                      <span>오디오 넣기나 음성 녹음을 누르면 새 오디오 트랙이 이 편집기에 한 줄로 추가됩니다.</span>
                    </div>
                  )}
                </div>
              </div>
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
              <div className="automix-cut-stage">
                {renderAutoMixCutOverlay()}
              </div>
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
            {selectionBox && (toolMode === 'select' || toolMode === 'lasso') ? (
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
                {selectedPatternRepeatGroup ? (
                  <button
                    type="button"
                    className="pattern-ungroup-button"
                    onPointerDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      ungroupSelectedPattern()
                    }}
                    title="그룹 해제 (Ctrl+U)"
                  >
                    그룹 해제
                  </button>
                ) : null}
                <label
                  className="pattern-gap-control"
                  onPointerDown={(event) => {
                    event.stopPropagation()
                  }}
                >
                  <span>간격</span>
                  <input
                    type="number"
                    min="0"
                    max="512"
                    step="1"
                    value={patternRepeatGapInput}
                    onChange={(event) => setPatternRepeatGapInput(event.target.value)}
                    onBlur={commitPatternRepeatGap}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        event.currentTarget.blur()
                      }
                    }}
                  />
                  <em>칸</em>
                </label>
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
                  }${
                    playbackPressedPitchCountsRef.current.has(pitch) ? ' is-playback-pressed' : ''
                  }`}
                  data-pitch={pitch}
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
                  {(otherNotesByPitch.get(pitch) ?? []).map((note) => {
                      const className = [
                        'note-block',
                        allTrackMelodyMode ? 'is-all-track-note' : 'is-ghost',
                        selectedNoteIdSet.has(note.id) ? 'is-selected' : '',
                        selectedNoteIdSet.has(note.id) && selectedNoteIds.length > 1 ? 'is-pattern-selected' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')

                      if (!allTrackMelodyMode) {
                        return (
                          <span
                            className={className}
                            key={`${note.trackId}-${note.id}`}
                            style={{
                              left: `${(note.startBeat / totalBeats) * 100}%`,
                              width: `${(note.durationBeats / totalBeats) * 100}%`,
                            }}
                            aria-hidden="true"
                          />
                        )
                      }

                      return (
                        <button
                          type="button"
                          className={className}
                          key={`${note.trackId}-${note.id}`}
                          style={{
                            left: `${(note.startBeat / totalBeats) * 100}%`,
                            width: `${(note.durationBeats / totalBeats) * 100}%`,
                          }}
                          onPointerDown={(event) => {
                            beginMoveNote(note, event)
                          }}
                        />
                      )
                    })}

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
                <span>트랙 전체를 블록처럼 여러 번 배치하고, 그 배치대로 재생과 내보내기가 따라갑니다.</span>
                <div className="arrange-actions">
                  <button
                    type="button"
                    disabled={!selectedTrack}
                    onPointerDown={() => {
                      if (!selectedTrack) return
                      addTrackPlacement(selectedTrack.id)
                    }}
                  >
                    선택 트랙 배치 추가
                  </button>
                </div>
              </header>
              <div className="arrange-summary">
                <article>
                  <strong>{project.tracks.length}</strong>
                  <span>전체 트랙</span>
                </article>
                <article>
                  <strong>{project.tracks.filter((track) => track.kind === 'audio').length}</strong>
                  <span>오디오 트랙</span>
                </article>
                <article>
                  <strong>{Object.values(project.notesByTrack).reduce((count, notes) => count + notes.length, 0)}</strong>
                  <span>음표 수</span>
                </article>
                <article>
                  <strong>{(project.audioClips ?? []).length}</strong>
                  <span>클립 수</span>
                </article>
              </div>
              <div className="arrange-help">
                <article>
                  <strong>1. 전체 구조 확인</strong>
                  <span>어느 트랙에 멜로디와 오디오가 얼마나 들어갔는지 빠르게 훑습니다.</span>
                </article>
                <article>
                  <strong>2. 바로 편집으로 이동</strong>
                  <span>파란 음표나 초록 오디오 클립을 누르면 그 트랙과 위치로 즉시 이동합니다.</span>
                </article>
                <article>
                  <strong>3. 컷 위치 잡기</strong>
                  <span>윗줄 빈 공간을 누르면 그 지점에 AutoMix 컷을 바로 추가할 수 있습니다.</span>
                </article>
              </div>
              <div className="arrange-timeline" onPointerDown={addAutoMixSectionFromPointer}>
                {renderAutoMixCutOverlay()}
                {Array.from({ length: visibleBars }, (_, bar) => (
                  <span key={bar}>{bar + 1}</span>
                ))}
              </div>
              <div className="arrange-lanes">
                {project.tracks.map((track) => {
                  const notes = arrangedProject.notesByTrack[track.id] ?? []
                  const clips = (arrangedProject.audioClips ?? []).filter((clip) => clip.trackId === track.id)
                  const placements = getTrackPlacements(project, track.id)
                  const sourceLengthBeats = getTrackSourceEndBeat(project, track.id)
                  return (
                    <div className="arrange-lane" key={track.id}>
                      <button
                        type="button"
                        className={track.id === project.selectedTrackId ? 'is-active' : ''}
                        onPointerDown={() => selectTrack(track.id)}
                      >
                        <img alt="" draggable={false} src={getInstrumentImage(track.instrumentId)} />
                        <span>{track.name}</span>
                      </button>
                      <div className="arrange-lane-grid">
                        <button
                          type="button"
                          className="arrange-add-placement"
                          onPointerDown={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            addTrackPlacement(track.id)
                          }}
                        >
                          ＋ 전체 트랙 배치
                        </button>
                        {placements.map((placement) => (
                          <div
                            className={placement.id === selectedTrackPlacementId ? 'arrange-track-placement is-selected' : 'arrange-track-placement'}
                            key={placement.id}
                            onPointerDown={(event) => beginTrackPlacementDrag(placement, event, 'move')}
                            role="button"
                            tabIndex={0}
                            style={{
                              left: `${(placement.startBeat / totalBeats) * 100}%`,
                              width: `${Math.max(3, (placement.spanBeats / totalBeats) * 100)}%`,
                            }}
                          >
                            <strong>{track.name}</strong>
                            <span>{Math.round(placement.spanBeats * 100) / 100}박</span>
                            <em>원본 {Math.round(sourceLengthBeats * 100) / 100}박</em>
                            <button
                              type="button"
                              className="arrange-track-placement-delete"
                              onPointerDown={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                deleteTrackPlacement(placement.id)
                              }}
                            >
                              ×
                            </button>
                            <span
                              className="arrange-track-placement-resize"
                              onPointerDown={(event) => beginTrackPlacementDrag(placement, event, 'resize')}
                            />
                          </div>
                        ))}
                        {notes.map((note) => (
                          <button
                            type="button"
                            className="arrange-note"
                            key={note.id}
                            title={`${track.name} · ${getPitchName(note.pitch)} · ${Math.round(note.startBeat * 100) / 100}박`}
                            onPointerDown={(event) => {
                              event.preventDefault()
                              focusTrackAtBeat(track.id, note.startBeat)
                            }}
                            style={{
                              left: `${(note.startBeat / totalBeats) * 100}%`,
                              width: `${(note.durationBeats / totalBeats) * 100}%`,
                            }}
                          />
                        ))}
                        {clips.map((clip) => (
                          <button
                            type="button"
                            className="arrange-audio-clip"
                            key={clip.id}
                            title={clip.name}
                            onPointerDown={(event) => {
                              event.preventDefault()
                              focusTrackAtBeat(track.id, clip.startBeat)
                            }}
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
                          </button>
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
                <span>기본 BPM만 바꾸는 화면이 아니라, 구간별 빠르기 흐름을 나눠서 관리하는 화면입니다.</span>
              </header>
              <div className="tempo-overview">
                <article>
                  <strong>{project.tempo}</strong>
                  <span>기본 BPM</span>
                </article>
                <article>
                  <strong>{tempoSections.length}</strong>
                  <span>빠르기 구간</span>
                </article>
                <article>
                  <strong>{selectedTempoSection ? selectedTempoSection.tempo : project.tempo}</strong>
                  <span>{selectedTempoSection ? '선택한 구간 BPM' : '현재 편집 BPM'}</span>
                </article>
              </div>
              <div className="tempo-graph" onPointerDown={changeTempoFromGraph}>
                {renderAutoMixCutOverlay()}
                {renderTempoSectionOverlay()}
                <span className="tempo-graph-min">{TEMPO_GRAPH_MIN}</span>
                <span className="tempo-graph-max">{TEMPO_GRAPH_MAX}</span>
                <span
                  className="tempo-graph-fill"
                  style={{ height: `${Math.min(100, Math.max(0, (((selectedTempoSection?.tempo ?? project.tempo) - TEMPO_GRAPH_MIN) / (TEMPO_GRAPH_MAX - TEMPO_GRAPH_MIN)) * 100))}%` }}
                />
                <span
                  className="tempo-graph-handle"
                  style={{ bottom: `${Math.min(100, Math.max(0, (((selectedTempoSection?.tempo ?? project.tempo) - TEMPO_GRAPH_MIN) / (TEMPO_GRAPH_MAX - TEMPO_GRAPH_MIN)) * 100))}%` }}
                >
                  {selectedTempoSection ? `${selectedTempoSection.tempo} BPM` : `${project.tempo} BPM`}
                </span>
              </div>
              <div className="tempo-section-actions">
                <button type="button" onPointerDown={() => addTempoSection()}>＋ 빠르기 구간 추가</button>
                <button type="button" onPointerDown={() => setSelectedTempoSectionId(null)}>기본 BPM 편집</button>
                <span>구간을 하나 만든 뒤 선택하면 그래프와 숫자 입력으로 그 구간 BPM을 바로 다듬을 수 있습니다.</span>
              </div>
              {tempoSections.length > 0 ? (
                <div className="tempo-section-list">
                  {tempoSections.map((section) => (
                    <article className={section.id === selectedTempoSection?.id ? 'tempo-section-card is-selected' : 'tempo-section-card'} key={section.id}>
                      <div className="tempo-section-top">
                        <input
                          aria-label="빠르기 구간 이름"
                          value={section.name}
                          onFocus={() => focusTempoSection(section.id)}
                          onChange={(event) => updateTempoSection(section.id, { name: event.target.value })}
                        />
                        <button type="button" onPointerDown={() => deleteTempoSection(section.id)}>삭제</button>
                      </div>
                      <div className="tempo-section-grid">
                        <label>
                          <span>시작 마디</span>
                          <input
                            min={1}
                            step={0.25}
                            type="number"
                            value={Number((section.startBeat / BEATS_PER_BAR + 1).toFixed(2))}
                            onChange={(event) => updateTempoSection(section.id, { startBeat: Math.max(0, (Number(event.target.value) - 1) * BEATS_PER_BAR) })}
                          />
                        </label>
                        <label>
                          <span>끝 마디</span>
                          <input
                            min={1.25}
                            step={0.25}
                            type="number"
                            value={Number((section.endBeat / BEATS_PER_BAR + 1).toFixed(2))}
                            onChange={(event) => updateTempoSection(section.id, { endBeat: Math.max(0.25, (Number(event.target.value) - 1) * BEATS_PER_BAR) })}
                          />
                        </label>
                        <label>
                          <span>BPM</span>
                          <input
                            min={TEMPO_INPUT_MIN}
                            max={TEMPO_INPUT_MAX}
                            step={1}
                            type="number"
                            value={section.tempo}
                            onChange={(event) => updateTempoSection(section.id, { tempo: Number(event.target.value) })}
                          />
                        </label>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="tempo-empty">
                  <strong>아직 빠르기 구간이 없습니다.</strong>
                  <span>전체 곡 BPM만 쓸 수도 있지만, 도입부와 후렴처럼 느낌이 달라지면 구간을 나눠 두는 편이 훨씬 낫습니다.</span>
                </div>
              )}
              <div className="tempo-view-controls">
                <button type="button" onPointerDown={() => updateTempo((selectedTempoSection?.tempo ?? project.tempo) - 1)}>−</button>
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
                <button type="button" onPointerDown={() => updateTempo((selectedTempoSection?.tempo ?? project.tempo) + 1)}>＋</button>
              </div>
            </div>
          ) : (
            <div className="automix-view" aria-label="믹스 우선순위">
              <header>
                <strong>믹스 우선순위</strong>
                <span>컷을 나누고 구간마다 중심 트랙을 고르면 자동 믹스가 그 구간의 밸런스를 다시 맞춥니다.</span>
              </header>
              <div className="automix-view-actions">
                <button type="button" onPointerDown={addAutoMixSection}>＋ 컷 추가 (C)</button>
                <label className="automix-genre-select">
                  <span>장르 추천</span>
                  <select
                    value={autoMixGenrePreset}
                    onChange={(event) => applyAutoMixGenrePreset(event.target.value as AutoMixGenrePreset)}
                  >
                    {AUTO_MIX_GENRE_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id}>{preset.label}</option>
                    ))}
                  </select>
                </label>
                <button type="button" disabled={isAutoMixing} onPointerDown={() => void runAutoMixTracks()}>
                  {isAutoMixing ? '자동 믹스 중...' : '자동 믹스 적용'}
                </button>
              </div>
              {renderAutoMixCutOverlay()}
              <div className="automix-explain">
                <strong>자동 믹스는 트랙 음량, 구간별 음표 음량, 좌우 위치를 조정합니다.</strong>
                <span>발라드, 록, 힙합 같은 장르 추천을 먼저 적용한 뒤, 컷마다 중심 트랙만 바꾸면 훨씬 빠르게 정리됩니다.</span>
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
                    <article className={section.id === selectedAutoMixSection?.id ? 'automix-section is-selected' : 'automix-section'} key={section.id}>
                      <div className="automix-section-top">
                        <input
                          aria-label="구간 이름"
                          value={section.name}
                          onFocus={() => focusAutoMixSection(section.id)}
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

        <section className={detailPanelOpen ? 'detail-panel' : 'detail-panel is-collapsed'} aria-label="세부 편집">
          <div className="detail-header">
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
            <button
              type="button"
              className="detail-toggle-button"
              onPointerDown={() => setDetailPanelOpen((current) => !current)}
              title={detailPanelOpen ? '세부 메뉴 접기' : '세부 메뉴 펼치기'}
            >
              {detailPanelOpen ? '세부 메뉴 접기' : '세부 메뉴 펼치기'}
            </button>
          </div>

          {detailPanelOpen ? (
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
                {activeNoteControl ? (
                  <div className="note-control-graph">
                    <div className="note-control-graph-head">
                      <span>{activeNoteControl.label}</span>
                      <em>{activeNoteControl.format(getSelectedNoteValue(activeNoteControl.key))}</em>
                    </div>
                    {detailGraphNotes.length > 0 && detailGraphBounds ? (
                      <svg
                        className="note-control-graph-svg"
                        ref={detailGraphSvgRef}
                        viewBox="0 0 100 100"
                        aria-label={`${activeNoteControl.label} 그래프 편집`}
                        onPointerDown={(event) => beginDetailGraphDrag(event, activeNoteControl, detailGraphNotes)}
                        onPointerMove={(event) => {
                          const drag = detailGraphDragRef.current
                          if (!drag?.active || drag.pointerId !== event.pointerId) return
                          updateDetailGraphFromPointer(event.clientX, event.clientY)
                        }}
                        onPointerUp={(event) => {
                          finishDetailGraphDrag(event.pointerId)
                        }}
                        onPointerCancel={(event) => {
                          finishDetailGraphDrag(event.pointerId)
                        }}
                        onLostPointerCapture={(event) => {
                          finishDetailGraphDrag(event.pointerId)
                        }}
                      >
                        <line x1="0" y1="100" x2="100" y2="100" />
                        <line x1="0" y1="0" x2="0" y2="100" />
                        <polyline
                          points={detailGraphNotes.map((note) => {
                            const beatSpan = Math.max(0.25, detailGraphBounds.maxBeat - detailGraphBounds.minBeat)
                            const x = ((note.startBeat - detailGraphBounds.minBeat) / beatSpan) * 100
                            const normalizedValue = (getNoteControlValue(note, activeNoteControl.key) - activeNoteControl.min) / (activeNoteControl.max - activeNoteControl.min || 1)
                            const y = 100 - Math.max(0, Math.min(1, normalizedValue)) * 100
                            return `${x.toFixed(2)},${y.toFixed(2)}`
                          }).join(' ')}
                        />
                        {detailGraphNotes.map((note) => {
                          const beatSpan = Math.max(0.25, detailGraphBounds.maxBeat - detailGraphBounds.minBeat)
                          const x = ((note.startBeat - detailGraphBounds.minBeat) / beatSpan) * 100
                          const normalizedValue = (getNoteControlValue(note, activeNoteControl.key) - activeNoteControl.min) / (activeNoteControl.max - activeNoteControl.min || 1)
                          const y = 100 - Math.max(0, Math.min(1, normalizedValue)) * 100
                          return (
                            <circle
                              key={note.id}
                              cx={x}
                              cy={y}
                              r="2.2"
                              onPointerDown={(event) => beginDetailGraphDrag(event, activeNoteControl, detailGraphNotes)}
                            />
                          )
                        })}
                      </svg>
                    ) : (
                      <span className="note-control-hint">편집할 음표를 선택하세요.</span>
                    )}
                  </div>
                ) : (
                  <span className="note-control-hint">아래 음표 정보 탭에서 개별 수치를 직접 수정할 수 있습니다.</span>
                )}
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
          ) : null}

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
