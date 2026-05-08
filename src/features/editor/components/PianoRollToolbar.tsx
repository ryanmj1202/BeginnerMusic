import type { Dispatch, SetStateAction } from 'react'
import {
  getInstrumentIcon,
  getInstrumentImage,
  getInstrumentLabel,
} from '../../../lib/midi/generalMidi'
import type { Track } from '../../../types/music'
import { NOTE_DIVISIONS, ROLL_ZOOM_LEVELS } from '../constants'
import type { NoteDivision, RollZoom, ToolMode } from '../types'

type PianoRollToolbarProps = {
  changeToolMode: (nextToolMode: ToolMode) => void
  keyboardInputEnabled: boolean
  noteDivision: NoteDivision
  openInstrumentDialog: (track: Track) => void
  rollZoom: RollZoom
  selectedTrack: Track | undefined
  setKeyboardInputEnabled: Dispatch<SetStateAction<boolean>>
  setNoteDivision: Dispatch<SetStateAction<NoteDivision>>
  toolMode: ToolMode
  visibleBars: number
  zoomRoll: (direction: -1 | 1) => void
}

export function PianoRollToolbar({
  changeToolMode,
  keyboardInputEnabled,
  noteDivision,
  openInstrumentDialog,
  rollZoom,
  selectedTrack,
  setKeyboardInputEnabled,
  setNoteDivision,
  toolMode,
  visibleBars,
  zoomRoll,
}: PianoRollToolbarProps) {
  return (
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
  )
}
