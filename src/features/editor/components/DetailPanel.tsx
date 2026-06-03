import type {
  Dispatch,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
} from 'react'
import { useEffect, useRef, useState } from 'react'
import type { Note } from '../../../types/music'
import { TEMPO_PRESETS, TERMINOLOGY_HELP } from '../constants'
import { getPitchName } from '../helpers'
import { clampNoteControlValue, quantizeValue } from '../utils/noteControlUtils'
import type { EditableNoteControlKey } from '../types'

type ActiveNoteControl = {
  format: (value: number) => string
  key: EditableNoteControlKey
  label: string
  max: number
  min: number
  step: number
} | null

type DetailPanelProps = {
  activeDetailTerm: string
  activeNoteControl: ActiveNoteControl
  changeTempoInput: (value: string) => void
  commitTempoInput: () => void
  detailPanelOpen: boolean
  editableSelectedNotes: Note[]
  getSelectedNoteValue: (key: EditableNoteControlKey) => number
  isPlaying: boolean
  projectTempo: number
  resetPlayback: () => void
  selectedNote: Note | null
  setActiveDetailTerm: Dispatch<SetStateAction<string>>
  setDetailPanelOpen: Dispatch<SetStateAction<boolean>>
  sortedEditableSelectedNotes: Note[]
  tempoInput: string
  togglePlayback: () => void
  updateSingleNoteControlValue: (
    noteId: string,
    key: EditableNoteControlKey,
    value: number,
  ) => void
  updateNoteEvent: (
    noteId: string,
    updates: Partial<Pick<Note, 'pitch' | 'startBeat' | 'durationBeats' | 'velocity'>>,
  ) => void
  updateTempo: (tempo: number) => void
}

function getControlRange(key: EditableNoteControlKey) {
  if (key === 'pitchBend') return { min: -2, max: 2, step: 0.01 }
  if (key === 'pan') return { min: -1, max: 1, step: 0.01 }
  if (key === 'velocity') return { min: 0.05, max: 1, step: 0.01 }
  return { min: 0, max: 1, step: 0.01 }
}

function formatControlValue(control: ActiveNoteControl, value: number) {
  if (!control) return ''
  return control.format(value)
}

function getNormalizedValue(key: EditableNoteControlKey, value: number) {
  if (key === 'pan') return (value + 1) / 2
  if (key === 'pitchBend') return (value + 2) / 4
  return value
}

function renderControlArt(key: EditableNoteControlKey, value: number) {
  const normalized = Math.max(0, Math.min(1, getNormalizedValue(key, value)))
  const knobX = 18 + normalized * 164
  const leftPower = key === 'pan' ? 1 - normalized : normalized
  const rightPower = key === 'pan' ? normalized : normalized

  if (key === 'pan') {
    return (
      <svg className="note-control-art-svg" viewBox="0 0 200 86" aria-hidden="true">
        <text className="note-control-wave" x="18" y="48" opacity={0.25 + leftPower * 0.75}>{'((('}</text>
        <path className="note-control-headband" d="M72 43a28 28 0 0 1 56 0" />
        <path className="note-control-headphone-leg" d="M72 43v18M128 43v18" />
        <rect className="note-control-earcup" x="58" y="54" width="22" height="20" rx="7" />
        <rect className="note-control-earcup" x="120" y="54" width="22" height="20" rx="7" />
        <text className="note-control-wave-right" x="151" y="48" opacity={0.25 + rightPower * 0.75}>{')))'}</text>
        <line className="note-control-bend-track" x1="18" y1="80" x2="182" y2="80" />
        <circle className="note-control-knob" cx={knobX} cy="80" r="6" />
      </svg>
    )
  }

  if (key === 'pitchBend') {
    return (
      <svg className="note-control-art-svg" viewBox="0 0 200 86" aria-hidden="true">
        <path className="note-control-bend-track" d="M30 58c40-46 98 46 140-20" />
        <text className="note-control-wave" x="85" y="35">{'~'}</text>
        <line className="note-control-bend-track" x1="18" y1="80" x2="182" y2="80" />
        <circle className="note-control-knob" cx={knobX} cy="80" r="6" />
      </svg>
    )
  }

  if (key === 'modulation') {
    return (
      <svg className="note-control-art-svg" viewBox="0 0 200 86" aria-hidden="true">
        <path className="note-control-wave-path" d="M26 46c10-24 20 24 30 0s20-24 30 0 20 24 30 0 20-24 30 0 20 24 30 0" />
        <text className="note-control-wave" x="84" y="30" opacity={0.35 + normalized * 0.65}>~</text>
        <line className="note-control-bend-track" x1="18" y1="80" x2="182" y2="80" />
        <circle className="note-control-knob" cx={knobX} cy="80" r="6" />
      </svg>
    )
  }

  if (key === 'reverb') {
    return (
      <svg className="note-control-art-svg" viewBox="0 0 200 86" aria-hidden="true">
        <path className="note-control-speaker" d="M42 53h20l24-18v38L62 55H42z" />
        <path className="note-control-wave-path" d="M104 35c24 10 24 32 0 42" opacity={0.25 + normalized * 0.35} />
        <path className="note-control-wave-path" d="M122 25c38 18 38 48 0 66" opacity={0.2 + normalized * 0.45} />
        <path className="note-control-wave-path" d="M142 16c52 26 52 66 0 86" opacity={0.15 + normalized * 0.55} />
        <circle className="note-control-knob" cx={92 + normalized * 62} cy={34 + normalized * 18} r={4 + normalized * 4} opacity={0.45 + normalized * 0.55} />
        <line className="note-control-bend-track" x1="18" y1="80" x2="182" y2="80" />
        <circle className="note-control-knob" cx={knobX} cy="80" r="6" />
      </svg>
    )
  }

  return (
    <svg className="note-control-art-svg" viewBox="0 0 200 86" aria-hidden="true">
      <path className="note-control-speaker" d="M50 52h24l28-22v46L74 54H50z" />
      <text className="note-control-wave-right" x="118" y="54" opacity={0.25 + normalized * 0.75}>{')))'}</text>
      <line className="note-control-bend-track" x1="18" y1="80" x2="182" y2="80" />
      <circle className="note-control-knob" cx={knobX} cy="80" r="6" />
    </svg>
  )
}

export function DetailPanel({
  activeDetailTerm,
  activeNoteControl,
  changeTempoInput,
  commitTempoInput,
  detailPanelOpen,
  editableSelectedNotes,
  getSelectedNoteValue,
  isPlaying,
  projectTempo,
  resetPlayback,
  selectedNote,
  setActiveDetailTerm,
  setDetailPanelOpen,
  sortedEditableSelectedNotes,
  tempoInput,
  togglePlayback,
  updateNoteEvent,
  updateSingleNoteControlValue,
  updateTempo,
}: DetailPanelProps) {
  const selectedValue = activeNoteControl ? getSelectedNoteValue(activeNoteControl.key) : 0
  const [draftControlValue, setDraftControlValue] = useState<number | null>(null)
  const [metronomeOn, setMetronomeOn] = useState(false)
  const metronomeAudioContextRef = useRef<AudioContext | null>(null)
  const displayValue = draftControlValue ?? selectedValue
  const parsedMetronomeTempo = Number(tempoInput)
  const metronomeTempo = Number.isFinite(parsedMetronomeTempo) && parsedMetronomeTempo > 0
    ? parsedMetronomeTempo
    : projectTempo
  const range = activeNoteControl ? getControlRange(activeNoteControl.key) : null
  const editableNotes = editableSelectedNotes.length > 0
    ? editableSelectedNotes
    : selectedNote
      ? [selectedNote]
      : []

  useEffect(() => {
    setDraftControlValue(null)
  }, [activeNoteControl?.key, selectedNote?.id, selectedValue])

  useEffect(() => {
    return () => {
      void metronomeAudioContextRef.current?.close()
      metronomeAudioContextRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!metronomeOn || !isPlaying || metronomeTempo <= 0) return

    let beatIndex = 0
    let cancelled = false

    function playClick(accent: boolean) {
      const context = metronomeAudioContextRef.current
      if (!context) return

      const now = context.currentTime
      const oscillator = context.createOscillator()
      const gain = context.createGain()

      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(accent ? 1320 : 880, now)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(accent ? 0.22 : 0.15, now + 0.006)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06)

      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.onended = () => {
        oscillator.disconnect()
        gain.disconnect()
      }
      oscillator.start(now)
      oscillator.stop(now + 0.07)
    }

    async function startMetronome() {
      metronomeAudioContextRef.current ??= new AudioContext()

      if (metronomeAudioContextRef.current.state === 'suspended') {
        await metronomeAudioContextRef.current.resume()
      }

      if (!cancelled) playClick(true)
    }

    void startMetronome()

    const intervalId = window.setInterval(() => {
      beatIndex = (beatIndex + 1) % 4
      playClick(beatIndex === 0)
    }, Math.max(80, (60 / metronomeTempo) * 1000))

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [isPlaying, metronomeOn, metronomeTempo])

  function updateControlValue(rawValue: number) {
    if (!activeNoteControl) return
    const nextValue = quantizeValue(
      clampNoteControlValue(activeNoteControl.key, rawValue),
      activeNoteControl.step,
    )
    setDraftControlValue(nextValue)
    editableNotes.forEach((note) => {
      updateSingleNoteControlValue(note.id, activeNoteControl.key, nextValue)
    })
  }

  function updateControlValueFromPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (!activeNoteControl || !range || editableNotes.length === 0) return
    const target = event.currentTarget
    const applyPointerValue = (clientX: number) => {
      const rect = target.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      updateControlValue(range.min + ratio * (range.max - range.min))
    }
    applyPointerValue(event.clientX)
    target.setPointerCapture?.(event.pointerId)
    const handlePointerMove = (moveEvent: PointerEvent) => applyPointerValue(moveEvent.clientX)
    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  return (
    <section className={detailPanelOpen ? 'detail-panel' : 'detail-panel is-collapsed'} aria-label="상세 편집">
      <div className="detail-header">
        <div className="detail-tabs" aria-label="detail tabs">
          {TERMINOLOGY_HELP.map((item) => (
            <button
              className={activeDetailTerm === item.term ? 'is-active' : ''}
              key={item.term}
              onPointerDown={() => setActiveDetailTerm(item.term)}
              type="button"
            >
              <span>{item.term}</span>
            </button>
          ))}
        </div>
        <button
          className="detail-toggle-button"
          onPointerDown={() => setDetailPanelOpen((current) => !current)}
          type="button"
        >
          {detailPanelOpen ? '접기' : '펼치기'}
        </button>
      </div>

      {detailPanelOpen ? (
        <div className="velocity-lane">
          <div className="control-bundle">
            {activeNoteControl && range ? (
              <div className="note-control-panel">
                <strong>{activeNoteControl.label}</strong>
                <div className="note-control-card">
                  <div className="note-control-stage" onPointerDown={updateControlValueFromPointer}>
                    {renderControlArt(activeNoteControl.key, displayValue)}
                    <input
                      aria-label={activeNoteControl.label}
                      max={range.max}
                      min={range.min}
                      onChange={(event) => updateControlValue(Number(event.target.value))}
                      onInput={(event) => updateControlValue(Number(event.currentTarget.value))}
                      onPointerDown={(event) => event.stopPropagation()}
                      step={range.step}
                      type="range"
                      value={displayValue}
                    />
                  </div>
                  <span className="note-control-caption">
                    {formatControlValue(activeNoteControl, displayValue)}
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          {activeDetailTerm === '음표 정보' ? (
            <div className="event-editor">
              <strong>음표 정보</strong>
              {sortedEditableSelectedNotes.length === 0 ? (
                <span>선택한 음표가 없습니다.</span>
              ) : (
                <div className="event-grid">
                  {sortedEditableSelectedNotes.slice(0, 12).map((note) => (
                    <div className="event-row" key={note.id}>
                      <div className="event-card-heading">
                        <strong>{getPitchName(note.pitch)}</strong>
                        <span>{note.startBeat}박 시작</span>
                      </div>
                      <label className="event-field event-field-wide">
                        <span>음높이</span>
                        <input
                          aria-label="음높이"
                          max="108"
                          min="21"
                          onChange={(event) => updateNoteEvent(note.id, { pitch: Number(event.target.value) })}
                          type="range"
                          value={note.pitch}
                        />
                        <input
                          aria-label="음높이 숫자"
                          max="108"
                          min="21"
                          onChange={(event) => updateNoteEvent(note.id, { pitch: Number(event.target.value) })}
                          type="number"
                          value={note.pitch}
                        />
                      </label>
                      <label className="event-field">
                        <span>시작</span>
                        <input
                          aria-label="시작 박자"
                          onChange={(event) => updateNoteEvent(note.id, { startBeat: Number(event.target.value) })}
                          step="0.125"
                          type="number"
                          value={note.startBeat}
                        />
                      </label>
                      <label className="event-field">
                        <span>길이</span>
                        <input
                          aria-label="길이"
                          min="0.125"
                          onChange={(event) => updateNoteEvent(note.id, { durationBeats: Number(event.target.value) })}
                          step="0.125"
                          type="number"
                          value={note.durationBeats}
                        />
                      </label>
                      <label className="event-field event-field-wide">
                        <span>세기</span>
                        <input
                          aria-label="세기"
                          max="1"
                          min="0.05"
                          onChange={(event) => updateNoteEvent(note.id, { velocity: Number(event.target.value) })}
                          step="0.01"
                          type="range"
                          value={note.velocity}
                        />
                        <input
                          aria-label="세기 숫자"
                          max="1"
                          min="0.05"
                          onChange={(event) => updateNoteEvent(note.id, { velocity: Number(event.target.value) })}
                          step="0.01"
                          type="number"
                          value={note.velocity}
                        />
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="detail-footer">
        <button
          aria-label="중지"
          className="detail-stop-button"
          onPointerDown={resetPlayback}
          type="button"
        >
          ■
        </button>
        <button
          aria-label={isPlaying ? '일시정지' : '재생'}
          className="detail-play-button"
          onPointerDown={togglePlayback}
          type="button"
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <div className={metronomeOn ? 'metronome-control is-active' : 'metronome-control'}>
          <button
            aria-label={metronomeOn ? '메트로놈 끄기' : '메트로놈 켜기'}
            aria-pressed={metronomeOn}
            className="metronome-toggle"
            onPointerDown={(event) => {
              event.preventDefault()
              setMetronomeOn((current) => !current)
            }}
            type="button"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10.6 3h2.8l6 18H4.6l6-18Z" />
              <path d="M12 7v10" />
              <path d="m12 14 4-4" />
              <path d="M8.4 21h7.2" />
            </svg>
          </button>
          <label>
            <span>BPM</span>
            <input
              aria-label="BPM"
              inputMode="numeric"
              onBlur={commitTempoInput}
              onChange={(event) => changeTempoInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
              type="text"
              value={tempoInput}
            />
          </label>
        </div>
        <span className="selected-note-summary">{selectedNote ? `${getPitchName(selectedNote.pitch)} / ${Math.round(selectedNote.velocity * 100)}` : '선택한 음표 상자 없음'}</span>
      </div>
    </section>
  )
}
