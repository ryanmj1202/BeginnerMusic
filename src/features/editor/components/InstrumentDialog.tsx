import type {
  Dispatch,
  SetStateAction,
} from 'react'
import { useEffect, useMemo, useState } from 'react'
import { isDrumInstrument } from '../../../lib/audio/toneTransport'
import {
  FLUID_SOUNDFONT_BASE_URL,
  ORCHESTRAL_SOUNDFONT_BASE_URL,
  createOnlineSoundFontInstrumentId,
  getInstrumentImage,
} from '../../../lib/midi/generalMidi'
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
type CloudInstrument = {
  family: string
  id: InstrumentId
  label: string
  source: string
}
type GitHubContentItem = {
  name: string
  type: string
}
type CloudSource = {
  apiUrl: string
  baseUrl: string
  label: string
}

const CLOUD_SOURCES: CloudSource[] = [
  {
    apiUrl: 'https://api.github.com/repos/gleitz/midi-js-soundfonts/contents/FluidR3_GM',
    baseUrl: FLUID_SOUNDFONT_BASE_URL,
    label: 'FluidR3 GM',
  },
  {
    apiUrl: 'https://api.github.com/repos/gleitz/midi-js-soundfonts/contents/MusyngKite',
    baseUrl: ORCHESTRAL_SOUNDFONT_BASE_URL,
    label: 'MusyngKite',
  },
]

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
  const [cloudOpen, setCloudOpen] = useState(false)
  const [cloudQuery, setCloudQuery] = useState('')
  const [cloudAvailable, setCloudAvailable] = useState(() => navigator.onLine)
  const [cloudLoading, setCloudLoading] = useState(false)
  const [onlineInstruments, setOnlineInstruments] = useState<CloudInstrument[]>([])
  const cloudInstruments = useMemo(() => {
    const query = cloudQuery.trim().toLowerCase()
    return onlineInstruments.filter((instrument) => {
      if (!query) return true
      return `${instrument.label} ${instrument.family} ${instrument.source}`.toLowerCase().includes(query)
    })
  }, [cloudQuery, onlineInstruments])

  useEffect(() => {
    function updateCloudAvailability() {
      const online = navigator.onLine
      setCloudAvailable(online)
      if (!online) setCloudOpen(false)
    }

    window.addEventListener('online', updateCloudAvailability)
    window.addEventListener('offline', updateCloudAvailability)
    updateCloudAvailability()

    return () => {
      window.removeEventListener('online', updateCloudAvailability)
      window.removeEventListener('offline', updateCloudAvailability)
    }
  }, [])

  useEffect(() => {
    if (!cloudOpen || onlineInstruments.length > 0 || cloudLoading || !cloudAvailable) return

    let cancelled = false
    setCloudLoading(true)
    Promise.all(
      CLOUD_SOURCES.map(async (source) => {
        const response = await fetch(source.apiUrl)
        if (!response.ok) throw new Error(`Cloud source failed: ${response.status}`)
        const items = await response.json() as GitHubContentItem[]
        return items
          .filter((item) => item.type === 'dir' && item.name.endsWith('-mp3'))
          .map((item) => {
            const soundFontName = item.name.replace(/-mp3$/, '')
            return {
              family: 'Cloud',
              id: createOnlineSoundFontInstrumentId(source.baseUrl, soundFontName),
              label: soundFontName
                .split('_')
                .filter(Boolean)
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' '),
              source: source.label,
            }
          })
      }),
    )
      .then((groups) => {
        if (cancelled) return
        setOnlineInstruments(groups.flat().sort((left, right) => left.label.localeCompare(right.label)))
      })
      .catch(() => {
        if (cancelled) return
        setCloudAvailable(false)
        setCloudOpen(false)
      })
      .finally(() => {
        if (!cancelled) setCloudLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [cloudAvailable, cloudLoading, cloudOpen, onlineInstruments.length])

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

        {cloudOpen ? (
          <section className="instrument-cloud-window" aria-label="악기 클라우드">
            <header>
              <strong>악기 클라우드</strong>
              <button type="button" onPointerDown={() => setCloudOpen(false)}>닫기</button>
            </header>
            <input
              value={cloudQuery}
              placeholder="악기 검색"
              onChange={(event) => setCloudQuery(event.target.value)}
            />
            <div className="instrument-cloud-list">
              {cloudLoading ? (
                <span className="instrument-cloud-status">온라인 악기 목록 불러오는 중</span>
              ) : null}
              {cloudInstruments.map((instrument) => (
                <button
                  type="button"
                  className={selectedInstrumentId === instrument.id ? 'is-active' : ''}
                  key={instrument.id}
                  onPointerDown={() => {
                    previewInstrumentChoice(instrument.id)
                  }}
                >
                  <img alt="" draggable={false} src={getInstrumentImage(instrument.id)} />
                  <span>{instrument.label}</span>
                  <em>{instrument.source}</em>
                </button>
              ))}
            </div>
          </section>
        ) : null}

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
            <button
              type="button"
              disabled={!cloudAvailable}
              title={cloudAvailable ? '온라인 SoundFont 악기 불러오기' : '네트워크 연결이 없어 기본 악기만 사용할 수 있습니다'}
              onPointerDown={() => {
                if (cloudAvailable) setCloudOpen(true)
              }}
            >
              악기 클라우드
            </button>
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
