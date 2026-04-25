import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from 'react'
import type {
  Note,
  Project,
} from '../../../types/music'
import {
  NOTE_DRAG_SCROLL_MAX_STEP_PX,
  NOTE_DRAG_SCROLL_OUTSIDE_THRESHOLD_PX,
  NOTE_DRAG_SCROLL_SENSITIVITY_PX,
} from '../constants'
import {
  getGroupedPitchStep,
  nearlyEqual,
} from '../helpers'
import type { NoteDrag } from '../types'

type RollCell = {
  pitch: number
  rowIndex: number
  step: number
}

type UsePianoRollDragOptions = {
  changeHeldPreviewPitch: (pitch: number, velocity?: number, instrumentId?: string) => void
  eraseNoteAtCellOnce: (pitch: number, step: number, eraseState: { lastKey: string }) => boolean
  eraseRef: MutableRefObject<{ active: boolean; lastKey: string }>
  getCellFromPointer: (clientX: number, clientY: number) => RollCell | null
  noteDragRef: MutableRefObject<NoteDrag | null>
  pianoRollRef: MutableRefObject<HTMLDivElement | null>
  rightEraseRef: MutableRefObject<{ active: boolean; lastKey: string }>
  rollPitches: number[]
  rollPointerCaptureRef: MutableRefObject<{ pointerId: number; element: Element } | null>
  setProject: Dispatch<SetStateAction<Project>>
  stepsPerBeat: number
  totalBeats: number
  totalSteps: number
  updateSelectionBoxFromNotes: (notes: Note[], selecting?: boolean) => void
}

export function usePianoRollDrag({
  changeHeldPreviewPitch,
  eraseNoteAtCellOnce,
  eraseRef,
  getCellFromPointer,
  noteDragRef,
  pianoRollRef,
  rightEraseRef,
  rollPitches,
  rollPointerCaptureRef,
  setProject,
  stepsPerBeat,
  totalBeats,
  totalSteps,
  updateSelectionBoxFromNotes,
}: UsePianoRollDragOptions) {
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
        ; (element as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture(pointerId)
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
        ; (capture.element as unknown as { releasePointerCapture: (id: number) => void }).releasePointerCapture(capture.pointerId)
      }
    } catch {
      // ignore
    }
    rollPointerCaptureRef.current = null
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

  return {
    applyNoteDragAutoScroll,
    captureRollPointer,
    eraseDraggedCellFromPointer,
    eraseRightDraggedCellFromPointer,
    getGrabStepOffset,
    getOutsideEdgeScrollDelta,
    moveDraggedNoteFromPointer,
    moveDraggedNoteToCell,
    moveNoteGroupToCell,
    moveNoteToCell,
    releaseRollPointerCapture,
  }
}
