import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
  PointerEvent as ReactPointerEvent,
} from 'react'
import { createId, normalizePatternRepeatGapBeats } from '../helpers'
import type { PatternRepeatDrag, SelectionBox } from '../types'
import type { Note, PatternRepeatGroup, Project } from '../../../types/music'
import { toStoredNote } from '../utils/noteUtils'

type TrackNote = Note & { trackId: string }

type UsePatternRepeatActionsOptions = {
  allTrackNotes: TrackNote[]
  beatWidth: number
  beginHistoryBatch: () => void
  patternRepeatGapInput: string
  patternRepeatRef: MutableRefObject<PatternRepeatDrag | null>
  projectRef: MutableRefObject<Project>
  selectedPatternNotes: TrackNote[]
  selectedPatternRepeatGroup: PatternRepeatGroup | null
  selectionBox: SelectionBox | null
  setPatternRepeatGapInput: Dispatch<SetStateAction<string>>
  setProject: Dispatch<SetStateAction<Project>>
  setSelectedNoteIds: Dispatch<SetStateAction<string[]>>
  setSelectionBox: Dispatch<SetStateAction<SelectionBox | null>>
  snapBeatToGrid: (beat: number) => number
  stepsPerBeat: number
  updateSelectionBoxFromNotes: (notes: Note[], selecting?: boolean) => void
}

export function usePatternRepeatActions({
  allTrackNotes,
  beatWidth,
  beginHistoryBatch,
  patternRepeatGapInput,
  patternRepeatRef,
  projectRef,
  selectedPatternNotes,
  selectedPatternRepeatGroup,
  selectionBox,
  setPatternRepeatGapInput,
  setProject,
  setSelectedNoteIds,
  setSelectionBox,
  snapBeatToGrid,
  stepsPerBeat,
  updateSelectionBoxFromNotes,
}: UsePatternRepeatActionsOptions) {
  function getCurrentPatternRepeatGapSteps() {
    const parsed = Math.round(Number(patternRepeatGapInput))
    if (!Number.isFinite(parsed)) return 1
    return Math.max(0, Math.min(512, parsed))
  }

  function getCurrentPatternRepeatGapBeats() {
    return normalizePatternRepeatGapBeats(getCurrentPatternRepeatGapSteps() / stepsPerBeat)
  }

  function beginPatternRepeat(event: ReactPointerEvent<HTMLElement>) {
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
      notesByTrack: Object.fromEntries(Object.entries(current.notesByTrack).map(([trackId, notes]) => [
        trackId,
        [
          ...notes.filter((note) => !removedNoteIds.has(note.id)),
          ...nextNotes
            .filter((note) => note.trackId === trackId)
            .map(toStoredNote),
        ],
      ])),
      patternRepeatGroups: [
        ...(current.patternRepeatGroups ?? []).filter((group) => group.id !== repeat.existingGroupId),
        ...(nextRepeats.length > 0
          ? [{
              baseEndBeat: repeat.baseEndBeat,
              baseNoteIds: repeat.notes.map((note) => note.id),
              baseStartBeat: repeat.baseStartBeat,
              gapBeats: repeat.gapBeats,
              id: currentGroup?.id ?? createId('pattern-group'),
              repeats: nextRepeats,
            }]
          : []),
      ],
      selectedNoteId: nextSelectedIds[0] ?? current.selectedNoteId,
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

  function commitPatternRepeatGap() {
    const nextGapSteps = getCurrentPatternRepeatGapSteps()
    const nextGapBeats = getCurrentPatternRepeatGapBeats()

    setPatternRepeatGapInput(String(nextGapSteps))

    const group = selectedPatternRepeatGroup
    if (!group) return

    setProject((current) => {
      const nextGroups = (current.patternRepeatGroups ?? []).map((item) => (
        item.id === group.id ? { ...item, gapBeats: nextGapBeats } : item
      ))
      return { ...current, patternRepeatGroups: nextGroups }
    })
  }

  return {
    beginPatternRepeat,
    commitPatternRepeatGap,
    finishPatternRepeat,
    getCurrentPatternRepeatGapBeats,
    getCurrentPatternRepeatGapSteps,
    ungroupSelectedPattern,
    updatePatternRepeatPreview,
  }
}
