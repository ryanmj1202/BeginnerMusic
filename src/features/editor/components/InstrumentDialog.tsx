import type {
  Dispatch,
  SetStateAction,
} from 'react'
import { isDrumInstrument } from '../../../lib/audio/toneTransport'
import { getInstrumentImage } from '../../../lib/midi/generalMidi'
import type {
  InstrumentId,
  Track,
} from '../../../types/music'
import {
  INSTRUMENT_CATEGORY_IMAGES,
  INSTRUMENT_OPTIONS,
} from '../constants'
import { getCategoryLabel } from '../helpers'

type InstrumentOption = (typeof INSTRUMENT_OPTIONS)[number]

type InstrumentDialogProps = {
  categoryInstruments: InstrumentOption[]
  closeInstrumentDialog: () => void
  confirmInstrumentDialog: () => void
  instrumentCategories: string[]
  instrumentCategory: string
  instrumentDialogTrack: Track | null
  previewInstrumentChoice: (instrumentId: InstrumentId) => void
  selectedInstrumentId: InstrumentId
  setInstrumentCategory: Dispatch<SetStateAction<string>>
}

export function InstrumentDialog({
  categoryInstruments,
  closeInstrumentDialog,
  confirmInstrumentDialog,
  instrumentCategories,
  instrumentCategory,
  instrumentDialogTrack,
  previewInstrumentChoice,
  selectedInstrumentId,
  setInstrumentCategory,
}: InstrumentDialogProps) {
  if (!instrumentDialogTrack) return null

  return (
    <div className="instrument-dialog-backdrop" onPointerDown={closeInstrumentDialog}>
      <section
        className="instrument-dialog"
        aria-label="악기 선택"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="instrument-picker-grid">
          <div className="instrument-column">
            <span className="instrument-column-title">악기 종류</span>
            <div className="instrument-category-list">
              {instrumentCategories.map((category) => (
                <button
                  type="button"
                  className={instrumentCategory === category ? 'is-active' : ''}
                  key={category}
                  onPointerDown={() => setInstrumentCategory(category)}
                >
                  <img
                    alt=""
                    draggable={false}
                    src={getInstrumentImage(INSTRUMENT_CATEGORY_IMAGES[category] ?? 'gm-0')}
                  />
                  {getCategoryLabel(category)}
                </button>
              ))}
            </div>
          </div>

          <div className="instrument-column">
            <span className="instrument-column-title">악기</span>
            <div className="instrument-choice-list">
              {categoryInstruments.map((instrument) => (
                <button
                  type="button"
                  className={selectedInstrumentId === instrument.id ? 'is-active' : ''}
                  key={instrument.id}
                  onPointerDown={() => previewInstrumentChoice(instrument.id)}
                >
                  <img
                    alt=""
                    draggable={false}
                    src={getInstrumentImage(instrument.id)}
                  />
                  <span>{instrument.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="instrument-dialog-footer">
          <label className="rhythm-toggle">
            <input
              checked={isDrumInstrument(selectedInstrumentId)}
              type="checkbox"
              onChange={(event) => {
                if (event.target.checked) {
                  setInstrumentCategory('Drums')
                  previewInstrumentChoice('drums')
                  return
                }

                setInstrumentCategory('Piano')
                previewInstrumentChoice('gm-0')
              }}
            />
            리듬 트랙
          </label>

          <div className="instrument-dialog-actions">
            <button type="button" onPointerDown={closeInstrumentDialog}>취소</button>
            <button type="button" className="primary-action" onPointerDown={confirmInstrumentDialog}>
              확인
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
