import type {
  Dispatch,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  RefObject,
  SetStateAction,
} from 'react'
import type { Note } from '../../../types/music'
import {
  TEMPO_PRESETS,
  TERMINOLOGY_HELP,
} from '../constants'
import { getPitchName } from '../helpers'
import type {
  DetailGraphDrag,
  EditableNoteControlKey,
} from '../types'

type ActiveNoteControl = {
  format: (value: number) => string
  key: EditableNoteControlKey
  label: string
  max: number
  min: number
  step: number
} | null

type DetailGraphBounds = {
  maxBeat: number
  minBeat: number
} | null

type DetailPanelProps = {
  activeDetailTerm: string
  activeNoteControl: ActiveNoteControl
  beginDetailGraphDrag: (
    event: ReactPointerEvent<SVGElement>,
    control: { key: EditableNoteControlKey; min: number; max: number; step: number },
    notes: Note[],
  ) => void
  changeTempoInput: (value: string) => void
  commitTempoInput: () => void
  detailGraphBounds: DetailGraphBounds
  detailGraphDragRef: MutableRefObject<DetailGraphDrag | null>
  detailGraphNotes: Note[]
  detailGraphSvgRef: RefObject<SVGSVGElement | null>
  detailPanelOpen: boolean
  editableSelectedNotes: Note[]
  finishDetailGraphDrag: (pointerId?: number) => void
  getNoteControlValue: (note: Note, key: EditableNoteControlKey) => number
  getSelectedNoteValue: (key: EditableNoteControlKey) => number
  isPlaying: boolean
  projectTempo: number
  resetPlayback: () => void
  selectedNote: Note | null
  setActiveDetailTerm: Dispatch<SetStateAction<string>>
  setDetailPanelOpen: Dispatch<SetStateAction<boolean>>
  snapBeatToGrid: (beat: number) => number
  sortedEditableSelectedNotes: Note[]
  tempoInput: string
  togglePlayback: () => void
  updateDetailGraphFromPointer: (clientX: number, clientY: number) => void
  updateNoteEvent: (
    noteId: string,
    updates: Partial<Pick<Note, 'pitch' | 'startBeat' | 'durationBeats' | 'velocity'>>,
  ) => void
  updateTempo: (tempo: number) => void
}

export function DetailPanel({
  activeDetailTerm,
  activeNoteControl,
  beginDetailGraphDrag,
  changeTempoInput,
  commitTempoInput,
  detailGraphBounds,
  detailGraphDragRef,
  detailGraphNotes,
  detailGraphSvgRef,
  detailPanelOpen,
  editableSelectedNotes,
  finishDetailGraphDrag,
  getNoteControlValue,
  getSelectedNoteValue,
  isPlaying,
  projectTempo,
  resetPlayback,
  selectedNote,
  setActiveDetailTerm,
  setDetailPanelOpen,
  snapBeatToGrid,
  sortedEditableSelectedNotes,
  tempoInput,
  togglePlayback,
  updateDetailGraphFromPointer,
  updateNoteEvent,
  updateTempo,
}: DetailPanelProps) {
  return (
    <section className={detailPanelOpen ? 'detail-panel' : 'detail-panel is-collapsed'} aria-label="세부 편집">
      <div className="detail-header">
        <div className="detail-tabs" aria-label="편집 탭">
          {TERMINOLOGY_HELP.map((item) => (
            <button
              className={activeDetailTerm === item.term ? 'is-active' : ''}
              key={item.term}
              onPointerDown={() => setActiveDetailTerm(item.term)}
              title={`${item.label}: ${item.description}`}
              type="button"
            >
              <span>{item.term}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="detail-toggle-button"
          onPointerDown={() => setDetailPanelOpen((current) => !current)}
          title={detailPanelOpen ? '세부 메뉴 접기' : '세부 메뉴 펼치기'}
        >
          {detailPanelOpen ? '세부 메뉴 접기' : '세부 메뉴 펼치기'}
        </button>
      </div>

      {detailPanelOpen ? (
        <div className="velocity-lane">
          <div className="tempo-panel" aria-label="템포 설정">
            <label>
              <span>빠르기</span>
              <button type="button" onPointerDown={() => updateTempo(projectTempo - 5)}>−</button>
              <input
                aria-label="빠르기"
                inputMode="numeric"
                type="text"
                value={tempoInput}
                onBlur={commitTempoInput}
                onChange={(event) => changeTempoInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur()
                  }
                }}
              />
              <select
                aria-label="템포 선택"
                value={TEMPO_PRESETS.includes(projectTempo) ? projectTempo : 'custom'}
                onChange={(event) => updateTempo(Number(event.target.value))}
              >
                <option disabled value="custom">직접</option>
                {TEMPO_PRESETS.map((tempo) => (
                  <option key={tempo} value={tempo}>
                    {tempo}
                  </option>
                ))}
              </select>
              <button type="button" onPointerDown={() => updateTempo(projectTempo + 5)}>＋</button>
            </label>
          </div>

          <div className="note-control-panel">
            <strong>
              {editableSelectedNotes.length > 0
                ? `${editableSelectedNotes.length}개 음표 편집`
                : '음표를 선택하세요'}
            </strong>
            {activeNoteControl ? (
              <div className="note-control-graph">
                <div className="note-control-graph-head">
                  <span>{activeNoteControl.label}</span>
                  <em>{activeNoteControl.format(getSelectedNoteValue(activeNoteControl.key))}</em>
                </div>
                {detailGraphNotes.length > 0 && detailGraphBounds ? (
                  <svg
                    className="note-control-graph-svg"
                    ref={detailGraphSvgRef}
                    viewBox="0 0 100 100"
                    aria-label={`${activeNoteControl.label} 그래프 편집`}
                    onPointerDown={(event) => beginDetailGraphDrag(event, activeNoteControl, detailGraphNotes)}
                    onPointerMove={(event) => {
                      const drag = detailGraphDragRef.current
                      if (!drag?.active || drag.pointerId !== event.pointerId) return
                      updateDetailGraphFromPointer(event.clientX, event.clientY)
                    }}
                    onPointerUp={(event) => {
                      finishDetailGraphDrag(event.pointerId)
                    }}
                    onPointerCancel={(event) => {
                      finishDetailGraphDrag(event.pointerId)
                    }}
                    onLostPointerCapture={(event) => {
                      finishDetailGraphDrag(event.pointerId)
                    }}
                  >
                    <line x1="0" y1="100" x2="100" y2="100" />
                    <line x1="0" y1="0" x2="0" y2="100" />
                    <polyline
                      points={detailGraphNotes.map((note) => {
                        const beatSpan = Math.max(0.25, detailGraphBounds.maxBeat - detailGraphBounds.minBeat)
                        const x = ((note.startBeat - detailGraphBounds.minBeat) / beatSpan) * 100
                        const normalizedValue = (getNoteControlValue(note, activeNoteControl.key) - activeNoteControl.min) / (activeNoteControl.max - activeNoteControl.min || 1)
                        const y = 100 - Math.max(0, Math.min(1, normalizedValue)) * 100
                        return `${x.toFixed(2)},${y.toFixed(2)}`
                      }).join(' ')}
                    />
                    {detailGraphNotes.map((note) => {
                      const beatSpan = Math.max(0.25, detailGraphBounds.maxBeat - detailGraphBounds.minBeat)
                      const x = ((note.startBeat - detailGraphBounds.minBeat) / beatSpan) * 100
                      const normalizedValue = (getNoteControlValue(note, activeNoteControl.key) - activeNoteControl.min) / (activeNoteControl.max - activeNoteControl.min || 1)
                      const y = 100 - Math.max(0, Math.min(1, normalizedValue)) * 100
                      return (
                        <circle
                          key={note.id}
                          cx={x}
                          cy={y}
                          r="2.2"
                          onPointerDown={(event) => beginDetailGraphDrag(event, activeNoteControl, detailGraphNotes)}
                        />
                      )
                    })}
                  </svg>
                ) : (
                  <span className="note-control-hint">편집할 음표를 선택하세요.</span>
                )}
              </div>
            ) : (
              <span className="note-control-hint">아래 음표 정보 탭에서 개별 수치를 직접 수정할 수 있습니다.</span>
            )}
          </div>

          {activeDetailTerm === '음표 정보' ? (
            <div className="event-editor">
              <strong>음표 정보</strong>
              {sortedEditableSelectedNotes.length === 0 ? (
                <span>편집할 음표를 선택하세요.</span>
              ) : (
                <div className="event-grid">
                  <span>음</span>
                  <span>시작</span>
                  <span>길이</span>
                  <span>세기</span>
                  {sortedEditableSelectedNotes.slice(0, 12).map((note) => (
                    <div className="event-row" key={note.id}>
                      <input
                        aria-label="음높이"
                        type="number"
                        value={note.pitch}
                        onChange={(event) => updateNoteEvent(note.id, { pitch: Number(event.target.value) })}
                      />
                      <input
                        aria-label="시작 박자"
                        step="0.125"
                        type="number"
                        value={Number(note.startBeat.toFixed(3))}
                        onChange={(event) => updateNoteEvent(note.id, { startBeat: snapBeatToGrid(Number(event.target.value)) })}
                      />
                      <input
                        aria-label="길이"
                        step="0.125"
                        type="number"
                        value={Number(note.durationBeats.toFixed(3))}
                        onChange={(event) => updateNoteEvent(note.id, { durationBeats: snapBeatToGrid(Number(event.target.value)) })}
                      />
                      <input
                        aria-label="소리 세기"
                        max="1"
                        min="0.05"
                        step="0.01"
                        type="number"
                        value={Number(note.velocity.toFixed(2))}
                        onChange={(event) => updateNoteEvent(note.id, { velocity: Number(event.target.value) })}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="transport-bar">
        <div className="transport-buttons">
          <button type="button" onPointerDown={resetPlayback}>■</button>
          <button type="button" onPointerDown={togglePlayback}>{isPlaying ? '⏸' : '▶'}</button>
          <span>스페이스바 일시정지 / 이어재생</span>
        </div>

        <div className="selected-note-summary">
          {selectedNote ? `${getPitchName(selectedNote.pitch)} · 세기 ${Math.round(selectedNote.velocity * 100)}` : '음표 선택 없음'}
        </div>

        <span />
      </div>
    </section>
  )
}
