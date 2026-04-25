import type {
  Dispatch,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
} from 'react'
import { getTrackSourceEndBeat } from '../../../lib/arrangement/trackArrangement'
import type {
  PatternPlacement,
  Project,
} from '../../../types/music'
import { MIN_DURATION_BEATS } from '../constants'
import { createId } from '../helpers'
import type {
  EditorTab,
  TrackPlacementDrag,
} from '../types'

type UseArrangementActionsOptions = {
  beginHistoryBatch: () => void
  clampBeatToSong: (beat: number, durationBeats?: number) => number
  endHistoryBatch: () => void
  getCurrentPlaybackBeat: () => number
  projectRef: MutableRefObject<Project>
  selectTrack: (trackId: string) => void
  setActiveEditorTab: Dispatch<SetStateAction<EditorTab>>
  setProject: Dispatch<SetStateAction<Project>>
  setSelectedTrackPlacementId: Dispatch<SetStateAction<string | null>>
  snapBeatToGrid: (beat: number) => number
  totalBeats: number
  trackPlacementDragRef: MutableRefObject<TrackPlacementDrag | null>
}

export function useArrangementActions({
  beginHistoryBatch,
  clampBeatToSong,
  endHistoryBatch,
  getCurrentPlaybackBeat,
  projectRef,
  selectTrack,
  setActiveEditorTab,
  setProject,
  setSelectedTrackPlacementId,
  snapBeatToGrid,
  totalBeats,
  trackPlacementDragRef,
}: UseArrangementActionsOptions) {
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

  return {
    addTrackPlacement,
    beginTrackPlacementDrag,
    createTrackPlacement,
    deleteTrackPlacement,
    updateTrackPlacement,
  }
}
