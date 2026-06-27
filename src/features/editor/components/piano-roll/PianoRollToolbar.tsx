import {
  useEffect,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from 'react'
import {
  getInstrumentIcon,
  getInstrumentImage,
  getInstrumentLabel,
} from '../../../../lib/midi/generalMidi'
import {
  WORKSTATION_LOOP_LENGTH_OPTIONS,
  getWorkstationLoopSettings,
  setWorkstationLoopSettings,
  subscribeWorkstationLoopSettings,
  type WorkstationLoopSettings,
} from '../../../../lib/workstationLoop'
import type { Track } from '../../../../types/music'
import { NOTE_DIVISIONS, ROLL_ZOOM_LEVELS } from '../../constants'
import type { NoteDivision, RollZoom, ToolMode } from '../../types'

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

type FloatingTooltip = {
  description: string
  title: string
  x: number
  y: number
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
  const [workstationLoop, setWorkstationLoop] = useState<WorkstationLoopSettings>(() =>
    getWorkstationLoopSettings(),
  )
  const [floatingTooltip, setFloatingTooltip] = useState<FloatingTooltip | null>(null)

  useEffect(() => subscribeWorkstationLoopSettings(setWorkstationLoop), [])

  const showFloatingTooltip = (
    event: ReactPointerEvent<HTMLElement>,
    title: string,
    description: string,
  ) => {
    setFloatingTooltip({
      description,
      title,
      x: event.clientX,
      y: event.clientY,
    })
  }

  const moveFloatingTooltip = (event: ReactPointerEvent<HTMLElement>) => {
    setFloatingTooltip((current) => (
      current ? { ...current, x: event.clientX, y: event.clientY } : current
    ))
  }

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
          onPointerEnter={(event) => showFloatingTooltip(event, '그리기', '빈 칸을 눌러 새 음을 추가')}
          onPointerMove={moveFloatingTooltip}
          onPointerLeave={() => setFloatingTooltip(null)}
          onPointerDown={() => changeToolMode('draw')}
        >
          ✎
        </button>
        <button
          type="button"
          className={toolMode === 'erase' ? 'is-active' : ''}
          onPointerEnter={(event) => showFloatingTooltip(event, '지우기', '음을 눌러 빠르게 삭제')}
          onPointerMove={moveFloatingTooltip}
          onPointerLeave={() => setFloatingTooltip(null)}
          onPointerDown={() => changeToolMode('erase')}
        >
          ⌫
        </button>
        <button
          type="button"
          className={toolMode === 'select' ? 'is-active' : ''}
          onPointerEnter={(event) => showFloatingTooltip(event, '선택', '음을 선택하고 이동')}
          onPointerMove={moveFloatingTooltip}
          onPointerLeave={() => setFloatingTooltip(null)}
          onPointerDown={() => changeToolMode('select')}
        >
          ▣
        </button>
        <button
          type="button"
          className={toolMode === 'lasso' ? 'is-active' : ''}
          onPointerEnter={(event) => showFloatingTooltip(event, '그리기 선택', '그리기로 여러 음을 묶어 선택')}
          onPointerMove={moveFloatingTooltip}
          onPointerLeave={() => setFloatingTooltip(null)}
          onPointerDown={() => changeToolMode('lasso')}
        >
          ⌁
        </button>
        <button
          type="button"
          className={keyboardInputEnabled ? 'is-active' : ''}
          onPointerEnter={(event) => showFloatingTooltip(event, '키보드 입력', '컴퓨터 키보드로 음을 녹음')}
          onPointerMove={moveFloatingTooltip}
          onPointerLeave={() => setFloatingTooltip(null)}
          onPointerDown={() => setKeyboardInputEnabled((current) => !current)}
        >
          ⌨ 키보드 입력
        </button>
        <div className="workstation-loop-controls" aria-label="workstation loop">
          <button
            type="button"
            className={workstationLoop.enabled ? 'is-active' : ''}
            onPointerDown={() => setWorkstationLoopSettings({ enabled: !workstationLoop.enabled })}
          >
            반복
          </button>
          <select
            value={workstationLoop.lengthBeats}
            onChange={(event) => setWorkstationLoopSettings({ lengthBeats: Number(event.target.value) })}
          >
            {WORKSTATION_LOOP_LENGTH_OPTIONS.map((lengthBeats) => (
              <option key={lengthBeats} value={lengthBeats}>
                {lengthBeats / 4}마디
              </option>
            ))}
          </select>
        </div>
        <div className="roll-zoom-controls" aria-label="편집창 확대/축소">
          <button
            type="button"
            disabled={rollZoom === ROLL_ZOOM_LEVELS[0]}
            onPointerDown={() => zoomRoll(-1)}
          >
            −
          </button>
          <span>{Math.round(rollZoom * 100)}%</span>
          <button
            type="button"
            disabled={rollZoom === ROLL_ZOOM_LEVELS[ROLL_ZOOM_LEVELS.length - 1]}
            onPointerDown={() => zoomRoll(1)}
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
      {floatingTooltip ? (
        <div
          className="roll-floating-tooltip"
          style={{
            left: floatingTooltip.x,
            top: floatingTooltip.y,
          }}
        >
          <strong>{floatingTooltip.title}</strong>
          <span>{floatingTooltip.description}</span>
        </div>
      ) : null}
    </div>
  )
}
