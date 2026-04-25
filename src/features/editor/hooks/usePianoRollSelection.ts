import type {
  Dispatch,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
} from 'react'
import type {
  Note,
  Project,
} from '../../../types/music'
import {
  KEY_COLUMN_WIDTH,
  ROLL_HEADER_HEIGHT,
  ROLL_ROW_HEIGHT,
} from '../constants'
import type {
  LassoPoint,
  PatternSelection,
  RollPointerGeometry,
  SelectionBox,
  TrackNote,
} from '../types'
import {
  getSelectionBounds,
  isPointInPolygon,
} from '../utils/selectionUtils'

type RollCell = {
  pitch: number
  rowIndex: number
  step: number
}

type UsePianoRollSelectionOptions = {
  allTrackMelodyMode: boolean
  allTrackNotes: TrackNote[]
  cacheRollPointerGeometry: () => void
  closePianoRollContextMenu: () => void
  closeTrackContextMenu: () => void
  getCellFromPointer: (clientX: number, clientY: number) => RollCell | null
  lassoSelectionRef: MutableRefObject<{ active: boolean; points: LassoPoint[] }>
  patternSelectionRef: MutableRefObject<PatternSelection | null>
  pianoRollRef: MutableRefObject<HTMLDivElement | null>
  rollPitches: number[]
  rollPointerGeometryRef: MutableRefObject<RollPointerGeometry | null>
  selectedTrackId: string | undefined
  selectedTrackNotes: Note[]
  setEditMenuOpen: Dispatch<SetStateAction<boolean>>
  setLassoPoints: Dispatch<SetStateAction<LassoPoint[]>>
  setProject: Dispatch<SetStateAction<Project>>
  setSelectedNoteIds: Dispatch<SetStateAction<string[]>>
  setSelectionBox: Dispatch<SetStateAction<SelectionBox | null>>
  stepWidth: number
  stepsPerBeat: number
  totalBeats: number
  totalSteps: number
}

export function usePianoRollSelection({
  allTrackMelodyMode,
  allTrackNotes,
  cacheRollPointerGeometry,
  closePianoRollContextMenu,
  closeTrackContextMenu,
  getCellFromPointer,
  lassoSelectionRef,
  patternSelectionRef,
  pianoRollRef,
  rollPitches,
  rollPointerGeometryRef,
  selectedTrackId,
  selectedTrackNotes,
  setEditMenuOpen,
  setLassoPoints,
  setProject,
  setSelectedNoteIds,
  setSelectionBox,
  stepWidth,
  stepsPerBeat,
  totalBeats,
  totalSteps,
}: UsePianoRollSelectionOptions) {
  function getCurrentRollGridWidth() {
    const roll = pianoRollRef.current
    return Math.max(totalSteps * stepWidth, (roll?.clientWidth ?? 0) - KEY_COLUMN_WIDTH)
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
      : selectedTrackNotes.map((note) => ({ ...note, trackId: selectedTrackId ?? '' }))
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
      : selectedTrackNotes.map((note) => ({ ...note, trackId: selectedTrackId ?? '' }))
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

  function getLassoSelectedNotes(points: LassoPoint[]) {
    if (points.length < 3) return []

    const geometry = rollPointerGeometryRef.current
    if (!geometry) return []

    const notePool = allTrackMelodyMode
      ? allTrackNotes
      : selectedTrackNotes.map((note) => ({ ...note, trackId: selectedTrackId ?? '' }))

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

  return {
    beginLassoSelection,
    finishLassoSelection,
    finishPatternSelection,
    getLassoSelectedNotes,
    getPointerLassoPoint,
    selectAllNotes,
    selectNotesInLasso,
    selectNotesInPatternArea,
    updateLassoSelectionFromPointer,
    updatePatternSelectionFromPointer,
    updateSelectionBox,
    updateSelectionBoxFromNotes,
  }
}
