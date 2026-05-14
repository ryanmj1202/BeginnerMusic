import { useEffect, useLayoutEffect, useRef } from 'react'
import type {
  CSSProperties,
  Dispatch,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
  SetStateAction,
} from 'react'
import type {
  AudioClip,
  AutoMixSection,
  Note,
  PatternRepeatGroup,
  Track,
} from '../../../types/music'
import {
  KEY_COLUMN_WIDTH,
  ROLL_HEADER_HEIGHT,
  ROLL_ROW_HEIGHT,
} from '../constants'
import type {
  LassoPoint,
  NoteDivision,
  OtherNote,
  RollZoom,
  SelectionBox,
  ToolMode,
  TrackNote,
} from '../types'
import { AudioRollView } from './AudioRollView'
import { PianoRollRows } from './PianoRollRows'
import { PianoRollToolbar } from './PianoRollToolbar'

type PianoRollViewProps = {
  adjustAudioClipVolumeFromPointer: (clip: AudioClip, event: ReactPointerEvent<HTMLElement>) => void
  allTrackMelodyMode: boolean
  autoMixSections: AutoMixSection[]
  beatWidth: number
  beginKeyPreview: (pitch: number, event: ReactPointerEvent<HTMLButtonElement>) => void
  beginMoveNote: (note: Note, event: ReactPointerEvent<HTMLButtonElement>) => void
  beginPatternRepeat: (event: ReactPointerEvent<HTMLSpanElement>) => void
  beginRightEraseNote: (note: Note, event: ReactPointerEvent<HTMLButtonElement>) => void
  beginRowAction: (pitch: number, event: ReactPointerEvent<HTMLDivElement>) => void
  beginRowContextErase: (pitch: number, event: ReactMouseEvent<HTMLDivElement>) => void
  beginSelectionBoxMove: (event: ReactPointerEvent<HTMLSpanElement>) => void
  changeToolMode: (nextToolMode: ToolMode) => void
  commitPatternRepeatGap: () => void
  continueKeyPreview: (pitch: number) => void
  draggingNoteId: string | null
  getNoteDisplayLabel: (note: Note) => string
  getRowLabel: (pitch: number) => string
  keyboardInputEnabled: boolean
  lassoPoints: LassoPoint[]
  noteDivision: NoteDivision
  openInstrumentDialog: (track: Track) => void
  otherNotesByPitch: Map<number, OtherNote[]>
  patternRepeatGapInput: string
  pianoRollRef: RefObject<HTMLDivElement | null>
  playbackPressedPitchCounts: Map<number, number>
  pressedPitch: number | null
  projectSelectedNoteId: string | null
  resizingNoteId: string | null
  rollPitches: number[]
  rollShellStyle: CSSProperties
  rollTimelineStyle: CSSProperties
  rollZoom: RollZoom
  seekPlaybackFromTimeline: (event: ReactPointerEvent<HTMLDivElement>) => void
  selectedAudioClips: AudioClip[]
  selectedAutoMixSectionId: string | null
  selectedNoteIdSet: Set<string>
  selectedNoteIds: string[]
  selectedNotesByPitch: Map<number, TrackNote[]>
  selectedPatternRepeatGroup: PatternRepeatGroup | null
  selectedTrack: Track | undefined
  selectedTrackIsAudio: boolean
  tracks: Track[]
  selectionBox: SelectionBox | null
  setKeyboardInputEnabled: Dispatch<SetStateAction<boolean>>
  selectAutoMixSection: (sectionId: string) => void
  setNoteDivision: Dispatch<SetStateAction<NoteDivision>>
  setPatternRepeatGapInput: Dispatch<SetStateAction<string>>
  startResizingNote: (note: Note | TrackNote, event: ReactPointerEvent<HTMLSpanElement>) => void
  toolMode: ToolMode
  totalBeats: number
  ungroupSelectedPattern: () => void
  visibleBars: number
  zoomRoll: (direction: -1 | 1) => void
}

export function PianoRollView({
  adjustAudioClipVolumeFromPointer,
  allTrackMelodyMode,
  autoMixSections,
  beatWidth,
  beginKeyPreview,
  beginMoveNote,
  beginPatternRepeat,
  beginRightEraseNote,
  beginRowAction,
  beginRowContextErase,
  beginSelectionBoxMove,
  changeToolMode,
  commitPatternRepeatGap,
  continueKeyPreview,
  draggingNoteId,
  getNoteDisplayLabel,
  getRowLabel,
  keyboardInputEnabled,
  lassoPoints,
  noteDivision,
  openInstrumentDialog,
  otherNotesByPitch,
  patternRepeatGapInput,
  pianoRollRef,
  playbackPressedPitchCounts,
  pressedPitch,
  projectSelectedNoteId,
  resizingNoteId,
  rollPitches,
  rollShellStyle,
  rollTimelineStyle,
  rollZoom,
  seekPlaybackFromTimeline,
  selectedAudioClips,
  selectedAutoMixSectionId,
  selectedNoteIdSet,
  selectedNoteIds,
  selectedNotesByPitch,
  selectedPatternRepeatGroup,
  selectedTrack,
  selectedTrackIsAudio,
  tracks,
  selectionBox,
  setKeyboardInputEnabled,
  selectAutoMixSection,
  setNoteDivision,
  setPatternRepeatGapInput,
  startResizingNote,
  toolMode,
  totalBeats,
  ungroupSelectedPattern,
  visibleBars,
  zoomRoll,
}: PianoRollViewProps) {
  const zoomAnchorRef = useRef<{ gridRatio: number, pointerX: number } | null>(null)

  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current
    const roll = pianoRollRef.current
    if (!anchor || !roll) return

    const nextGridWidth = Number.parseFloat(getComputedStyle(roll).getPropertyValue('--roll-grid-width')) || 1
    roll.scrollLeft = Math.max(
      0,
      Math.min(
        roll.scrollWidth - roll.clientWidth,
        KEY_COLUMN_WIDTH + anchor.gridRatio * nextGridWidth - anchor.pointerX,
      ),
    )
    zoomAnchorRef.current = null
  }, [pianoRollRef, rollZoom])

  useEffect(() => {
    function handleRollZoomWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return

      const target = event.target
      if (!(target instanceof Element) || !target.closest('.piano-roll')) return

      const roll = pianoRollRef.current
      if (!roll) return

      const rect = roll.getBoundingClientRect()
      const pointerX = event.clientX - rect.left
      const gridWidth = Number.parseFloat(getComputedStyle(roll).getPropertyValue('--roll-grid-width')) || 1
      const gridX = roll.scrollLeft + pointerX - KEY_COLUMN_WIDTH
      const gridRatio = Math.max(0, Math.min(1, gridX / gridWidth))

      event.preventDefault()
      event.stopPropagation()
      zoomAnchorRef.current = { gridRatio, pointerX }
      zoomRoll(event.deltaY > 0 ? -1 : 1)
    }

    window.addEventListener('wheel', handleRollZoomWheel, { capture: true, passive: false })
    return () => window.removeEventListener('wheel', handleRollZoomWheel, { capture: true })
  }, [zoomRoll])

  return (
    <>
      <PianoRollToolbar
        changeToolMode={changeToolMode}
        keyboardInputEnabled={keyboardInputEnabled}
        noteDivision={noteDivision}
        openInstrumentDialog={openInstrumentDialog}
        rollZoom={rollZoom}
        selectedTrack={selectedTrack}
        setKeyboardInputEnabled={setKeyboardInputEnabled}
        setNoteDivision={setNoteDivision}
        toolMode={toolMode}
        visibleBars={visibleBars}
        zoomRoll={zoomRoll}
      />

      {selectedTrackIsAudio ? (
        <AudioRollView
          adjustAudioClipVolumeFromPointer={adjustAudioClipVolumeFromPointer}
          pianoRollRef={pianoRollRef}
          rollShellStyle={rollShellStyle}
          rollTimelineStyle={rollTimelineStyle}
          seekPlaybackFromTimeline={seekPlaybackFromTimeline}
          selectedAudioClips={selectedAudioClips}
          selectedTrack={selectedTrack}
          totalBeats={totalBeats}
          visibleBars={visibleBars}
        />
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
          {false ? <div className="auto-mix-cut-overlay" aria-label="자동 균형 조정 경계">
            {autoMixSections.map((section) => (
              <button
                type="button"
                className={section.id === selectedAutoMixSectionId ? 'is-selected' : ''}
                key={section.id}
                style={{
                  left: `${KEY_COLUMN_WIDTH + section.startBeat * beatWidth}px`,
                  width: `${Math.max(26, (section.endBeat - section.startBeat) * beatWidth)}px`,
                }}
                onPointerDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  selectAutoMixSection(section.id)
                }}              >
                컷
              </button>
            ))}
          </div> : null}
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
                  }}                >
                  묶음 해제
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
                <em>박</em>
              </label>
              <span
                className="pattern-repeat-handle"
                onPointerDown={beginPatternRepeat}              />
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

          <PianoRollRows
            allTrackMelodyMode={allTrackMelodyMode}
            beginKeyPreview={beginKeyPreview}
            beginMoveNote={beginMoveNote}
            beginRightEraseNote={beginRightEraseNote}
            beginRowAction={beginRowAction}
            beginRowContextErase={beginRowContextErase}
            continueKeyPreview={continueKeyPreview}
            draggingNoteId={draggingNoteId}
            getNoteDisplayLabel={getNoteDisplayLabel}
            getRowLabel={getRowLabel}
            otherNotesByPitch={otherNotesByPitch}
            playbackPressedPitchCounts={playbackPressedPitchCounts}
            pressedPitch={pressedPitch}
            projectSelectedNoteId={projectSelectedNoteId}
            resizingNoteId={resizingNoteId}
            rollPitches={rollPitches}
            selectedNoteIdSet={selectedNoteIdSet}
            selectedNoteIds={selectedNoteIds}
            selectedNotesByPitch={selectedNotesByPitch}
            selectedTrack={selectedTrack}
            tracks={tracks}
            startResizingNote={startResizingNote}
            totalBeats={totalBeats}
          />
        </div>
      )}
    </>
  )
}
