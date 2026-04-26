import { useRef } from 'react'
import type { TempoTimelineSegment } from '../helpers'
import type {
  ActivePlaybackTrack,
  DetailGraphDrag,
  InteractionHandlers,
  KeyboardRecordingNote,
  LassoPoint,
  NoteDrag,
  OtherNotesByPitchCache,
  PatternClipboard,
  PatternRepeatDrag,
  PatternSelection,
  PlaybackInstrument,
  PendingPointerMove,
  RightClickRollAction,
  RollPointerGeometry,
  TrackPlacementDrag,
} from '../types'
import type { HeldPreview } from '../../../lib/audio/toneTransport'

export function usePlaybackRefs() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioFileInputRef = useRef<HTMLInputElement>(null)
  const pianoRollRef = useRef<HTMLDivElement>(null)
  const detailGraphSvgRef = useRef<SVGSVGElement>(null)
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
  const heldPreviewRef = useRef<HeldPreview | null>(null)
  const previewTokenRef = useRef(0)
  const lastNoteDurationRef = useRef(0.5)
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
  const pointerMoveFrameRef = useRef(0)
  const pendingPointerMoveRef = useRef<PendingPointerMove | null>(null)
  const interactionHandlersRef = useRef<InteractionHandlers>({
    addAutoMixSection: () => { },
    copySelectedNotes: () => { },
    cutSelectedNotes: () => { },
    deleteSelectedNote: () => { },
    eraseDraggedCellFromPointer: () => { },
    eraseRightDraggedCellFromPointer: () => { },
    finishKeyboardNote: () => { },
    finishLassoSelection: () => { },
    finishPatternRepeat: () => { },
    finishPatternSelection: () => { },
    moveDraggedNoteFromPointer: () => { },
    pasteSelectedNotes: () => { },
    redoProject: () => { },
    selectAllNotes: () => { },
    startKeyboardNote: () => { },
    stopHeldPreview: () => { },
    togglePlayback: () => { },
    transposeSelectedNotes: () => { },
    undoProject: () => { },
    ungroupSelectedPattern: () => { },
    updateLassoSelectionFromPointer: () => { },
    updatePatternRepeatPreview: () => { },
    updatePatternSelectionFromPointer: () => { },
    zoomRoll: () => { },
  })
  const rollPointerGeometryRef = useRef<RollPointerGeometry | null>(null)
  const detailGraphDragRef = useRef<DetailGraphDrag | null>(null)
  const keyPreviewRef = useRef({ active: false })
  const playbackPressedPitchCountsRef = useRef<Map<number, number>>(new Map())
  const activeEditorTabRef = useRef<'piano-roll' | 'arrange' | 'tempo' | 'automix'>('piano-roll')
  const autoMixPanelOpenRef = useRef(false)
  const otherNotesByPitchCacheRef = useRef<OtherNotesByPitchCache | null>(null)

  return {
    activeAudioElementsRef,
    activeAudioNodesRef,
    activeEditorTabRef,
    activeInstrumentsRef,
    activeIntervalsRef,
    activePlaybackTracksRef,
    activeTimeoutsRef,
    audioFileInputRef,
    autoMixPanelOpenRef,
    detailGraphDragRef,
    detailGraphSvgRef,
    eraseRef,
    fileInputRef,
    heldPreviewRef,
    interactionHandlersRef,
    keyPreviewRef,
    keyboardRecordingRef,
    lastNoteDurationRef,
    lastPlayheadAutoScrollAtRef,
    lassoSelectionRef,
    mediaRecorderRef,
    noteDragRef,
    otherNotesByPitchCacheRef,
    patternClipboardRef,
    patternRepeatRef,
    patternSelectionRef,
    pendingPointerMoveRef,
    pianoRollRef,
    playbackBeatRef,
    playbackPressedPitchCountsRef,
    playbackSessionRef,
    playbackStartBeatRef,
    playbackStartMsRef,
    playbackStartSecondsRef,
    playbackTempoTimelineRef,
    pointerMoveFrameRef,
    previewTokenRef,
    recordingChunksRef,
    recordingStartBeatRef,
    recordingStartMsRef,
    rightClickRollActionRef,
    rightEraseRef,
    rollPointerGeometryRef,
    totalBeatsRef,
    trackPlacementDragRef,
  }
}
