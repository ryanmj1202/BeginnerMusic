import type {
  CSSProperties,
  Dispatch,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
  SetStateAction,
} from 'react'
import { isDrumInstrument } from '../../../lib/audio/toneTransport'
import {
  getInstrumentIcon,
  getInstrumentImage,
  getInstrumentLabel,
} from '../../../lib/midi/generalMidi'
import type {
  AudioClip,
  Note,
  PatternRepeatGroup,
  Track,
} from '../../../types/music'
import {
  KEY_COLUMN_WIDTH,
  NOTE_DIVISIONS,
  NOTE_NAMES,
  ROLL_HEADER_HEIGHT,
  ROLL_ROW_HEIGHT,
  ROLL_ZOOM_LEVELS,
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

type PianoRollViewProps = {
  adjustAudioClipVolumeFromPointer: (clip: AudioClip, event: ReactPointerEvent<HTMLElement>) => void
  allTrackMelodyMode: boolean
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
  renderAutoMixCutOverlay: () => ReactNode
  resizingNoteId: string | null
  rollPitches: number[]
  rollShellStyle: CSSProperties
  rollTimelineStyle: CSSProperties
  rollZoom: RollZoom
  seekPlaybackFromTimeline: (event: ReactPointerEvent<HTMLDivElement>) => void
  selectedAudioClips: AudioClip[]
  selectedNoteIdSet: Set<string>
  selectedNoteIds: string[]
  selectedNotesByPitch: Map<number, TrackNote[]>
  selectedPatternRepeatGroup: PatternRepeatGroup | null
  selectedTrack: Track | undefined
  selectedTrackIsAudio: boolean
  selectionBox: SelectionBox | null
  setKeyboardInputEnabled: Dispatch<SetStateAction<boolean>>
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
  renderAutoMixCutOverlay,
  resizingNoteId,
  rollPitches,
  rollShellStyle,
  rollTimelineStyle,
  rollZoom,
  seekPlaybackFromTimeline,
  selectedAudioClips,
  selectedNoteIdSet,
  selectedNoteIds,
  selectedNotesByPitch,
  selectedPatternRepeatGroup,
  selectedTrack,
  selectedTrackIsAudio,
  selectionBox,
  setKeyboardInputEnabled,
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
      <div className="roll-header">
        <button
          type="button"
          className="instrument-pill"
          onPointerDown={(event) => {
            if (!selectedTrack || event.button !== 0) return
            event.preventDefault()
            openInstrumentDialog(selectedTrack)
          }}
        >
          {selectedTrack ? (
            <img
              alt=""
              draggable={false}
              src={getInstrumentImage(selectedTrack.instrumentId)}
            />
          ) : (
            <span>{getInstrumentIcon('gm-0')}</span>
          )}
          {selectedTrack ? getInstrumentLabel(selectedTrack.instrumentId) : '피아노'}
        </button>
        <div className="roll-tools">
          <button
            type="button"
            className={toolMode === 'draw' ? 'is-active' : ''}
            onPointerDown={() => changeToolMode('draw')}
            title="그리기와 이동"
          >
            ✎
          </button>
          <button
            type="button"
            className={toolMode === 'erase' ? 'is-active' : ''}
            onPointerDown={() => changeToolMode('erase')}
            title="드래그 삭제"
          >
            ⌫
          </button>
          <button
            type="button"
            className={toolMode === 'select' ? 'is-active' : ''}
            onPointerDown={() => changeToolMode('select')}
            title="박스 선택"
          >
            ▣
          </button>
          <button
            type="button"
            className={toolMode === 'lasso' ? 'is-active' : ''}
            onPointerDown={() => changeToolMode('lasso')}
            title="자유 선택"
          >
            ⌁
          </button>
          <button
            type="button"
            className={keyboardInputEnabled ? 'is-active' : ''}
            onPointerDown={() => setKeyboardInputEnabled((current) => !current)}
            title="재생 중 A W S E D... 키로 실시간 입력"
          >
            ⌨ 키보드 입력
          </button>
          <div className="roll-zoom-controls" aria-label="피아노 롤 확대 축소">
            <button
              type="button"
              disabled={rollZoom === ROLL_ZOOM_LEVELS[0]}
              onPointerDown={() => zoomRoll(-1)}
              title="피아노 롤 축소"
            >
              −
            </button>
            <span>{Math.round(rollZoom * 100)}%</span>
            <button
              type="button"
              disabled={rollZoom === ROLL_ZOOM_LEVELS[ROLL_ZOOM_LEVELS.length - 1]}
              onPointerDown={() => zoomRoll(1)}
              title="피아노 롤 확대"
            >
              ＋
            </button>
          </div>
          <div className="division-buttons" aria-label="음표 단위">
            {NOTE_DIVISIONS.map((division) => (
              <button
                type="button"
                className={noteDivision === division ? 'is-active' : ''}
                key={division}
                onPointerDown={() => setNoteDivision(division)}
                title={`${division}분음표`}
              >
                <img
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  src={`/note-icons/note-${division}.svg`}
                />
                <small>{division}</small>
              </button>
            ))}
          </div>
          <span>{visibleBars}</span>
        </div>
      </div>

      {selectedTrackIsAudio ? (
        <div
          className="piano-roll audio-roll"
          ref={pianoRollRef}
          style={rollShellStyle}
        >
          <div className="corner-cell">오디오</div>
          <div
            className="measure-row"
            style={rollTimelineStyle}
            onPointerDown={seekPlaybackFromTimeline}
          >
            <span className="timeline-seek-fill" aria-hidden="true" />
            <span className="timeline-seek-handle" aria-hidden="true" />
            {renderAutoMixCutOverlay()}
            {Array.from({ length: visibleBars }, (_, bar) => (
              <div className="measure-cell" key={bar}>
                {bar + 1}
              </div>
            ))}
          </div>
          <div className="audio-roll-label">
            <strong>{selectedTrack?.name ?? '오디오 트랙'}</strong>
            <span>클립을 위아래로 드래그하면 볼륨이 바뀌고, 배치 탭에서는 전체 구성을 함께 볼 수 있습니다.</span>
          </div>
          <div className="audio-roll-grid">
            <div className="audio-roll-lane">
              {selectedAudioClips.length > 0 ? selectedAudioClips.map((clip) => (
                <button
                  type="button"
                  className="audio-roll-clip"
                  key={clip.id}
                  title={`${clip.name} · 볼륨 ${Math.round(clip.volume * 100)}`}
                  style={{
                    left: `${(clip.startBeat / totalBeats) * 100}%`,
                    width: `${Math.max(4, (clip.durationBeats / totalBeats) * 100)}%`,
                  }}
                  onPointerDown={(event) => adjustAudioClipVolumeFromPointer(clip, event)}
                >
                  <span className="audio-roll-waveform" aria-hidden="true">
                    {(clip.waveform?.length ? clip.waveform : Array.from({ length: 48 }, () => 0.25)).slice(0, 48).map((peak, index) => (
                      <i
                        key={index}
                        style={{ height: `${Math.max(12, Math.min(100, peak * clip.volume * 100))}%` }}
                      />
                    ))}
                  </span>
                  <span className="audio-roll-meta">
                    <strong>{clip.name}</strong>
                    <em>볼륨 {Math.round(clip.volume * 100)}</em>
                  </span>
                </button>
              )) : (
                <div className="audio-track-empty">
                  <strong>오디오 파일이 없습니다</strong>
                  <span>오디오 넣기나 음성 녹음을 누르면 새 오디오 트랙이 이 편집기에 한 줄로 추가됩니다.</span>
                </div>
              )}
            </div>
          </div>
        </div>
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
            <div className="automix-cut-stage">
              {renderAutoMixCutOverlay()}
            </div>
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
                      <span className="note-label">{getNoteDisplayLabel(note)}</span>
                      <span
                        className="resize-handle"
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
