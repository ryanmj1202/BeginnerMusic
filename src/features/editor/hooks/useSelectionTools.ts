import { isDrumInstrument } from '../../../lib/audio/toneTransport'
import { DRUM_LABELS } from '../constants'
import { getPitchName } from '../helpers'

type UseSelectionToolsOptions = Record<string, any>

export function useSelectionTools({
  allTrackMelodyMode,
  allTrackNotes,
  beginHistoryBatch,
  cacheRollPointerGeometry,
  captureRollPointer,
  getCellFromPointer,
  noteDragRef,
  rollPitches,
  selectedPatternNotes,
  selectedTrack,
  selectedTrackNotes,
  setDraggingNoteId,
  stepsPerBeat,
  setProject,
}: UseSelectionToolsOptions) {
  function getRowLabel(pitch: number) {
    if (selectedTrack && isDrumInstrument(selectedTrack.instrumentId)) {
      return DRUM_LABELS[pitch] ?? `Drum ${pitch}`
    }

    const name = getPitchName(pitch)
    return name.startsWith('C') ? name : ''
  }

  function getNoteDisplayLabel(note: { pitch: number }) {
    if (selectedTrack && isDrumInstrument(selectedTrack.instrumentId)) {
      return DRUM_LABELS[note.pitch] ?? `Drum ${note.pitch}`
    }

    return getPitchName(note.pitch)
  }

  function getNoteTrackId(note: Record<string, unknown>, fallbackTrackId = selectedTrack?.id ?? '') {
    return 'trackId' in note && typeof note.trackId === 'string' ? note.trackId : fallbackTrackId
  }

  function findEditableNoteAtCell(pitch: number, step: number) {
    const beat = step / stepsPerBeat
    const notePool = allTrackMelodyMode
      ? allTrackNotes
      : selectedTrackNotes.map((note: any) => ({ ...note, trackId: selectedTrack?.id ?? '' }))

    return notePool.find((note: any) => (
      note.pitch === pitch &&
      beat >= note.startBeat &&
      beat < note.startBeat + note.durationBeats
    )) ?? null
  }

  function beginSelectionBoxMove(event: React.PointerEvent<HTMLElement>) {
    if (event.button !== 0 || selectedPatternNotes.length === 0) return

    const pointerCell = getCellFromPointer(event.clientX, event.clientY)
    if (!pointerCell) return

    event.preventDefault()
    event.stopPropagation()
    captureRollPointer(event.pointerId, event.currentTarget)
    cacheRollPointerGeometry()

    const selectedRows = selectedPatternNotes
      .map((note: any) => rollPitches.indexOf(note.pitch))
      .filter((rowIndex: number) => rowIndex >= 0)
    if (selectedRows.length === 0) return

    const topRow = Math.min(...selectedRows)
    const originPitch = rollPitches[topRow]
    const originStep = Math.min(...selectedPatternNotes.map((note: any) => Math.round(note.startBeat * stepsPerBeat)))
    const firstNote = selectedPatternNotes[0]

    beginHistoryBatch()
    noteDragRef.current = {
      active: true,
      grabPitchOffset: pointerCell.pitch - originPitch,
      grabStepOffset: Math.max(0, pointerCell.step - originStep),
      groupNoteIds: selectedPatternNotes.map((note: any) => note.id),
      lastPitch: pointerCell.pitch,
      lastStep: pointerCell.step,
      noteId: firstNote.id,
      originalNotes: selectedPatternNotes,
      originPitch,
      originStep,
      trackId: firstNote.trackId,
    }
    setDraggingNoteId(firstNote.id)
    setProject((current: any) => current)
  }

  return {
    beginSelectionBoxMove,
    findEditableNoteAtCell,
    getNoteDisplayLabel,
    getNoteTrackId,
    getRowLabel,
  }
}
