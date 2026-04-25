import type { createInstrument } from '../../lib/audio/toneTransport'
import type { Note, PatternRepeatGroup } from '../../types/music'
import type {
  AUTO_MIX_GENRE_PRESETS,
  NOTE_DIVISIONS,
  ROLL_ZOOM_LEVELS,
} from './constants'

export type PlaybackInstrument = ReturnType<typeof createInstrument>

export type EditorTab = 'piano-roll' | 'arrange' | 'tempo' | 'automix'

export type ToolMode = 'draw' | 'erase' | 'select' | 'lasso'

export type NoteDivision = (typeof NOTE_DIVISIONS)[number]

export type RollZoom = (typeof ROLL_ZOOM_LEVELS)[number]

export type AutoMixGenrePreset = (typeof AUTO_MIX_GENRE_PRESETS)[number]['id']

export type EditableNoteControlKey =
  | 'velocity'
  | 'pitchBend'
  | 'volume'
  | 'pan'
  | 'expression'
  | 'modulation'

export type TrackNote = Note & {
  trackId: string
}

export type OtherNote = Note & {
  trackId: string
}

export type NoteDrag = {
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

export type PatternSelection = {
  active: boolean
  startRow: number
  startStep: number
  endRow: number
  endStep: number
}

export type SelectionBox = {
  height: number
  left: number
  selecting: boolean
  top: number
  width: number
}

export type LassoPoint = {
  gridX: number
  gridY: number
  viewX: number
  viewY: number
}

export type PatternRepeatDrag = {
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

export type KeyboardRecordingNote = {
  liveNoteInput: number | null
  noteId: string
  pitch: number
  startBeat: number
  trackId: string
}

export type TrackContextMenu = {
  trackId: string
  x: number
  y: number
} | null

export type PianoRollContextMenu = {
  x: number
  y: number
} | null

export type RightClickRollAction = {
  active: boolean
  deleted: boolean
  menuX: number
  menuY: number
  moved: boolean
  startX: number
  startY: number
}

export type PatternClipboard = {
  notes: Note[]
  sourceTrackId: string
  nextPasteBeat: number
}

export type TrackPlacementDrag = {
  placementId: string
  startBeat: number
  startClientX: number
  startSpanBeats: number
  type: 'move' | 'resize'
}

export type RollPointerGeometry = {
  gridWidth: number
  rect: DOMRect
  totalSteps: number
}

export type PendingPointerMove = {
  buttons: number
  clientX: number
  clientY: number
}

export type DetailGraphDrag = {
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

export type ActivePlaybackTrack = {
  id: string
  instrument: PlaybackInstrument
  isDrum: boolean
  notes: Note[]
  nextIndex: number
}

export type AutoMixReportItem = {
  afterPan: number
  afterVolume: number
  beforeVolume: number
  noteChanges: number
  role: string
  trackId: string
}

export type OtherNotesByPitchCache = {
  noteArrays: Note[][]
  selectedTrackId: string | undefined
  trackIds: string[]
  value: Map<number, OtherNote[]>
}

export type InteractionHandlers = {
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

export type PatternRepeatGroupByNoteId = Map<string, PatternRepeatGroup>