import { useState } from 'react'
import { TERMINOLOGY_HELP } from '../constants'
import type {
  EditorTab,
  LassoPoint,
  NoteDivision,
  RollZoom,
  SelectionBox,
  ToolMode,
} from '../types'
import type { Project } from '../../../types/music'

export function useEditorState(project: Project) {
  const [tempoInput, setTempoInput] = useState(() => String(project.tempo))
  const [resizingNoteId, setResizingNoteId] = useState<string | null>(null)
  const [isExportingMp3, setIsExportingMp3] = useState(false)
  const [isRecordingVoice, setIsRecordingVoice] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackBeat, setPlaybackBeat] = useState(0)
  const [selectedTempoSectionId, setSelectedTempoSectionId] = useState<string | null>(null)
  const [selectedTrackPlacementId, setSelectedTrackPlacementId] = useState<string | null>(null)
  const [activeEditorTab, setActiveEditorTab] = useState<EditorTab>('piano-roll')
  const [toolMode, setToolMode] = useState<ToolMode>('draw')
  const [allTrackMelodyMode, setAllTrackMelodyMode] = useState(false)
  const [pressedPitch, setPressedPitch] = useState<number | null>(null)
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [noteDivision, setNoteDivision] = useState<NoteDivision>(8)
  const [rollZoom, setRollZoom] = useState<RollZoom>(1)
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([])
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null)
  const [lassoPoints, setLassoPoints] = useState<LassoPoint[]>([])
  const [keyboardInputEnabled, setKeyboardInputEnabled] = useState(false)
  const [activeDetailTerm, setActiveDetailTerm] = useState(TERMINOLOGY_HELP[0].term)
  const [detailPanelOpen, setDetailPanelOpen] = useState(true)
  const [patternRepeatGapInput, setPatternRepeatGapInput] = useState('1')
  const [, setHistoryVersion] = useState(0)

  return {
    activeDetailTerm,
    activeEditorTab,
    allTrackMelodyMode,
    detailPanelOpen,
    draggingNoteId,
    isDraggingFile,
    isExportingMp3,
    isPlaying,
    isRecordingVoice,
    keyboardInputEnabled,
    lassoPoints,
    noteDivision,
    patternRepeatGapInput,
    playbackBeat,
    pressedPitch,
    resizingNoteId,
    rollZoom,
    selectedNoteIds,
    selectedTempoSectionId,
    selectedTrackPlacementId,
    selectionBox,
    setActiveDetailTerm,
    setActiveEditorTab,
    setAllTrackMelodyMode,
    setDetailPanelOpen,
    setDraggingNoteId,
    setHistoryVersion,
    setIsDraggingFile,
    setIsExportingMp3,
    setIsPlaying,
    setIsRecordingVoice,
    setKeyboardInputEnabled,
    setLassoPoints,
    setNoteDivision,
    setPatternRepeatGapInput,
    setPlaybackBeat,
    setPressedPitch,
    setResizingNoteId,
    setRollZoom,
    setSelectedNoteIds,
    setSelectedTempoSectionId,
    setSelectedTrackPlacementId,
    setSelectionBox,
    setTempoInput,
    setToolMode,
    tempoInput,
    toolMode,
  }
}
