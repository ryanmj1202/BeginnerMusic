import type {
  CSSProperties,
  Dispatch,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
  SetStateAction,
} from 'react'
import { isDrumInstrument } from '../../../lib/audio/toneTransport'
import type {
  AudioClip,
  AutoMixSection,
  Note,
  PatternRepeatGroup,
  Track,
} from '../../../types/music'
import {
  KEY_COLUMN_WIDTH,
  NOTE_NAMES,
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
                }}
                title={`${section.name} 선택`}
              >
                ✂
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
                  }}
                  title="그룹 해제 (Ctrl+U)"
                >
                  그룹 해제
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
                <em>칸</em>
              </label>
              <span
                className="pattern-repeat-handle"
                onPointerDown={beginPatternRepeat}
                title="오른쪽으로 늘려 패턴 반복"
              />
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

          {rollPitches.map((pitch) => (
            <div className="roll-row" key={pitch}>
              <button
                type="button"
                className={`${selectedTrack && isDrumInstrument(selectedTrack.instrumentId) ? 'piano-key is-drum' : NOTE_NAMES[pitch % 12].includes('#') ? 'piano-key is-black' : 'piano-key'}${pressedPitch === pitch ? ' is-pressed' : ''
                  }${playbackPressedPitchCounts.has(pitch) ? ' is-playback-pressed' : ''
                  }`}
                data-pitch={pitch}
                onPointerDown={(event) => {
                  beginKeyPreview(pitch, event)
                }}
                onPointerEnter={() => continueKeyPreview(pitch)}
              >
                {getRowLabel(pitch)}
              </button>
              <div
                className="step-row"
                onPointerDown={(event) => beginRowAction(pitch, event)}
                onContextMenu={(event) => beginRowContextErase(pitch, event)}
              >
                {(otherNotesByPitch.get(pitch) ?? []).map((note) => {
                  const className = [
                    'note-block',
                    allTrackMelodyMode ? 'is-all-track-note' : 'is-ghost',
                    selectedNoteIdSet.has(note.id) ? 'is-selected' : '',
                    selectedNoteIdSet.has(note.id) && selectedNoteIds.length > 1 ? 'is-pattern-selected' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')

                  if (!allTrackMelodyMode) {
                    return (
                      <span
                        className={className}
                        key={`${note.trackId}-${note.id}`}
                        style={{
                          left: `${(note.startBeat / totalBeats) * 100}%`,
                          width: `${(note.durationBeats / totalBeats) * 100}%`,
                        }}
                        aria-hidden="true"
                      />
                    )
                  }

                  return (
                    <button
                      type="button"
                      className={className}
                      key={`${note.trackId}-${note.id}`}
                      style={{
                        left: `${(note.startBeat / totalBeats) * 100}%`,
                        width: `${(note.durationBeats / totalBeats) * 100}%`,
                      }}
                      onPointerDown={(event) => {
                        beginMoveNote(note, event)
                      }}
                    />
                  )
                })}

                {(selectedNotesByPitch.get(pitch) ?? []).map((note) => {
                  const className = [
                    'note-block',
                    note.id === projectSelectedNoteId || selectedNoteIdSet.has(note.id) ? 'is-selected' : '',
                    selectedNoteIdSet.has(note.id) && selectedNoteIds.length > 1 ? 'is-pattern-selected' : '',
                    draggingNoteId === note.id ? 'is-dragging' : '',
                    resizingNoteId === note.id ? 'is-resizing' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')

                  return (
                    <button
                      type="button"
                      className={className}
                      key={note.id}
                      style={{
                        left: `${(note.startBeat / totalBeats) * 100}%`,
                        width: `${(note.durationBeats / totalBeats) * 100}%`,
                      }}
                      onPointerDown={(event) => {
                        beginMoveNote(note, event)
                      }}
                      onPointerDownCapture={(event) => {
                        beginRightEraseNote(note, event)
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault()
                      }}
                      aria-label={`${getNoteDisplayLabel(note)} 음표`}
                    >
                      <span
                        className="resize-handle resize-handle-start"
                        data-edge="start"
                        onPointerDown={(event) => startResizingNote(note, event)}
                        aria-hidden="true"
                      />
                      <span className="note-label">{getNoteDisplayLabel(note)}</span>
                      <span
                        className="resize-handle"
                        data-edge="end"
                        onPointerDown={(event) => startResizingNote(note, event)}
                        aria-hidden="true"
                      />
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
