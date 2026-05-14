import { MIN_DURATION_BEATS } from '../constants'
import { nearlyEqual, prunePatternRepeatGroups } from '../helpers'
import {
  clampNoteControlValue,
  getNoteControlValue,
  getSelectedNoteValue as getSelectedNoteValueFromNotes,
  quantizeValue,
} from '../utils/noteControlUtils'

type UseNoteEditingOptions = Record<string, any>

export function useNoteEditing({
  allTrackNotes,
  allTrackNotesById,
  beginHistoryBatch,
  detailGraphDragRef,
  detailGraphSvgRef,
  editableSelectedNotes,
  endHistoryBatch,
  getNoteTrackId,
  lastNoteDurationRef,
  selectedNote,
  selectedNoteIds,
  setProject,
  setResizingNoteId,
  setSelectedNoteIds,
  setSelectionBox,
  stepsPerBeat,
  totalBeats,
  totalSteps,
}: UseNoteEditingOptions) {
  function deleteNote(noteId: string) {
    setSelectedNoteIds((current: string[]) => current.filter((id) => id !== noteId))
    setSelectionBox(null)
    setProject((current: any) => ({
      ...current,
      notesByTrack: Object.fromEntries(Object.entries(current.notesByTrack).map(([trackId, notes]: any) => [
        trackId,
        notes.filter((note: any) => note.id !== noteId),
      ])),
      patternRepeatGroups: prunePatternRepeatGroups(current.patternRepeatGroups, new Set([noteId])),
      selectedNoteId: current.selectedNoteId === noteId ? null : current.selectedNoteId,
    }))
  }

  function deleteSelectedNotes() {
    if (selectedNoteIds.length === 0) return

    const idsToDelete = new Set<string>(selectedNoteIds)
    setSelectedNoteIds([])
    setSelectionBox(null)
    setProject((current: any) => ({
      ...current,
      notesByTrack: Object.fromEntries(Object.entries(current.notesByTrack).map(([trackId, notes]: any) => [
        trackId,
        notes.filter((note: any) => !idsToDelete.has(note.id)),
      ])),
      patternRepeatGroups: prunePatternRepeatGroups(current.patternRepeatGroups, idsToDelete),
      selectedNoteId: null,
    }))
  }

  function deleteSelectedNote() {
    if (selectedNoteIds.length > 1) {
      deleteSelectedNotes()
      return
    }

    if (!selectedNote) return
    deleteNote(selectedNote.id)
  }

  function transposeSelectedNotes(direction: number) {
    if (editableSelectedNotes.length === 0) return

    const pitchDelta = direction
    const targetIds = new Set(editableSelectedNotes.map((note: any) => note.id))
    const targetNotes = allTrackNotes.filter((note: any) => targetIds.has(note.id))
    if (targetNotes.length === 0) return

    const minNextPitch = Math.min(...targetNotes.map((note: any) => note.pitch + pitchDelta))
    const maxNextPitch = Math.max(...targetNotes.map((note: any) => note.pitch + pitchDelta))
    if (minNextPitch < 0 || maxNextPitch > 127) return

    setProject((current: any) => ({
      ...current,
      notesByTrack: Object.fromEntries(Object.entries(current.notesByTrack).map(([trackId, notes]: any) => [
        trackId,
        notes.map((note: any) => (
          targetIds.has(note.id) ? { ...note, pitch: note.pitch + pitchDelta } : note
        )),
      ])),
    }))
  }

  function getSelectedNoteValue(key: string) {
    return getSelectedNoteValueFromNotes(editableSelectedNotes, key as any)
  }

  function updateSingleNoteControlValue(noteId: string, key: string, value: number) {
    const clamped = clampNoteControlValue(key as any, value)
    setProject((current: any) => {
      let changed = false
      const nextNotesByTrack = Object.fromEntries(Object.entries(current.notesByTrack).map(([trackId, notes]: any) => [
        trackId,
        notes.map((note: any) => {
          if (note.id !== noteId) return note
          const currentValue = getNoteControlValue(note, key as any)
          if (nearlyEqual(currentValue, clamped)) return note
          changed = true
          return { ...note, [key]: clamped }
        }),
      ]))

      return changed ? { ...current, notesByTrack: nextNotesByTrack, tracks: current.tracks } : current
    })
  }

  function updateDetailGraphSegmentValues(
    key: string,
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
      if (!note || note.startBeat < segmentStartBeat || note.startBeat > segmentEndBeat) return

      const ratio = (note.startBeat - segmentStartBeat) / segmentSpan
      const rawValue = beatA <= beatB
        ? valueA + (valueB - valueA) * ratio
        : valueB + (valueA - valueB) * ratio
      const quantized = quantizeValue(rawValue, step)
      updates.set(noteId, Math.max(min, Math.min(max, quantized)))
    })

    if (updates.size === 0) return

    setProject((current: any) => {
      let changed = false
      const nextNotesByTrack = Object.fromEntries(Object.entries(current.notesByTrack).map(([trackId, notes]: any) => [
        trackId,
        notes.map((note: any) => {
          const nextValue = updates.get(note.id)
          if (nextValue === undefined) return note

          const currentValue = getNoteControlValue(note, key as any)
          if (nearlyEqual(currentValue, nextValue)) return note
          changed = true
          return { ...note, [key]: nextValue }
        }),
      ]))

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
    const nearestNoteId = drag.noteIds.reduce((nearest: string, noteId: string) => {
      const note = allTrackNotesById.get(noteId)
      if (!note) return nearest
      if (!nearest) return noteId

      const nearestNote = allTrackNotesById.get(nearest)
      if (!nearestNote) return noteId

      return Math.abs(note.startBeat - targetBeat) < Math.abs(nearestNote.startBeat - targetBeat)
        ? noteId
        : nearest
    }, '')
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

  function beginDetailGraphDrag(event: React.PointerEvent<SVGSVGElement>, control: any, notes: any[]) {
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
    setProject((current: any) => {
      let changed = false
      const audioClips = (current.audioClips ?? []).map((clip: any) => {
        if (clip.id !== clipId || nearlyEqual(clip.volume, nextVolume)) return clip
        changed = true
        return { ...clip, volume: nextVolume }
      })

      return changed ? { ...current, audioClips } : current
    })
  }

  function adjustAudioClipVolumeFromPointer(clip: any, event: React.PointerEvent<HTMLElement>) {
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

  function updateNoteEvent(noteId: string, updates: Record<string, number>) {
    setProject((current: any) => {
      let changed = false
      const nextNotesByTrack = Object.fromEntries(Object.entries(current.notesByTrack).map(([trackId, notes]: any) => [
        trackId,
        notes.map((note: any) => {
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
      ]))

      return changed ? { ...current, notesByTrack: nextNotesByTrack, selectedNoteId: noteId } : current
    })
  }

  function resizeNote(targetNote: any, durationBeats: number) {
    const trackId = getNoteTrackId(targetNote)
    if (!trackId) return

    setProject((current: any) => {
      const currentNotes = current.notesByTrack[trackId] ?? []
      let changed = current.selectedNoteId !== targetNote.id
      const nextNotes = currentNotes.map((note: any) => {
        if (note.id !== targetNote.id) return note

        const nextDurationBeats = Math.max(MIN_DURATION_BEATS, Math.min(totalBeats - note.startBeat, durationBeats))
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
        notesByTrack: {
          ...current.notesByTrack,
          [trackId]: nextNotes,
        },
        selectedNoteId: targetNote.id,
      }
    })
  }

  function startResizingNote(note: any, event: React.PointerEvent<HTMLElement>) {
    const row = event.currentTarget.closest('.step-row')
    if (!(row instanceof HTMLElement)) return

    const trackId = getNoteTrackId(note)
    if (!trackId) return

    event.preventDefault()
    event.stopPropagation()

    const resizeEdge = event.currentTarget.dataset.edge === 'start' ? 'start' : 'end'
    setResizingNoteId(note.id)
    beginHistoryBatch()
    setProject((current: any) => (current.selectedNoteId === note.id ? current : { ...current, selectedNoteId: note.id }))

    const rowRect = row.getBoundingClientRect()
    const originalEndBeat = note.startBeat + note.durationBeats
    let pendingClientX = event.clientX
    let resizeFrameId = 0

    function applyPendingResize() {
      resizeFrameId = 0
      const x = Math.min(Math.max(pendingClientX - rowRect.left, 0), rowRect.width)
      const step = resizeEdge === 'start'
        ? Math.floor((x / rowRect.width) * totalSteps)
        : Math.ceil((x / rowRect.width) * totalSteps)
      const pointerBeat = step / stepsPerBeat

      if (resizeEdge === 'start') {
        const startBeat = Math.max(0, Math.min(originalEndBeat - MIN_DURATION_BEATS, pointerBeat))
        const durationBeats = Math.max(MIN_DURATION_BEATS, originalEndBeat - startBeat)
        setProject((current: any) => {
          const currentNotes = current.notesByTrack[trackId] ?? []
          let changed = current.selectedNoteId !== note.id
          const nextNotes = currentNotes.map((item: any) => {
            if (item.id !== note.id) return item
            if (nearlyEqual(item.startBeat, startBeat) && nearlyEqual(item.durationBeats, durationBeats)) return item

            changed = true
            lastNoteDurationRef.current = durationBeats
            return {
              ...item,
              durationBeats,
              startBeat,
            }
          })

          if (!changed) return current

          return {
            ...current,
            notesByTrack: {
              ...current.notesByTrack,
              [trackId]: nextNotes,
            },
            selectedNoteId: note.id,
          }
        })
        return
      }

      resizeNote(note, pointerBeat - note.startBeat)
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

  return {
    adjustAudioClipVolumeFromPointer,
    beginDetailGraphDrag,
    deleteNote,
    deleteSelectedNote,
    deleteSelectedNotes,
    finishDetailGraphDrag,
    getSelectedNoteValue,
    resizeNote,
    startResizingNote,
    transposeSelectedNotes,
    updateAudioClipVolume,
    updateDetailGraphFromPointer,
    updateNoteEvent,
    updateSingleNoteControlValue,
  }
}
