import type {
  Dispatch,
  SetStateAction,
} from 'react'
import { useEffect, useMemo, useState } from 'react'
import { isDrumInstrument } from '../../../lib/audio/toneTransport'
import {
  createOnlineWebAudioFontInstrumentId,
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
  imageInstrumentId: InstrumentId
  label: string
  source: string
}
const WEBAUDIOFONT_CATALOG_URL = 'https://surikov.github.io/webaudiofontdata/sound/'
const WEBAUDIOFONT_SCRIPT_BASE_URL = 'https://surikov.github.io/webaudiofontdata/sound/'

const RECOMMENDED_CLOUD_NAMES = new Set([
  '0220_Aspirin_sf2_file.html',
  '0220_JCLive_sf2_file.html',
  '0250_Acoustic_Guitar_sf2_file.html',
  '0270_Gibson_Les_Paul_sf2_file.html',
  '0280_LesPaul_sf2_file.html',
  '0400_Aspirin_sf2_file.html',
  '0560_JCLive_sf2_file.html',
  '0880_Chaos_sf2_file.html',
])

function formatCloudSourceName(fileName: string) {
  return fileName
    .replace(/^\d+_/, '')
    .replace(/_sf2_file\.html$|_sf2\.html$|\.html$/g, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function getWebAudioFontVariableName(fileName: string) {
  const baseName = fileName.replace(/\.html$/, '')
  return `_${baseName.replace(/[^A-Za-z0-9_]/g, '_')}`
}

function createCloudInstrument(fileName: string): CloudInstrument | null {
  const match = fileName.match(/^(\d{3})\d*_/)
  if (!match) return null
  const program = Number(match[1])
  const localInstrument = INSTRUMENT_OPTIONS.find((option) => option.id === `gm-${program}`)
  if (!localInstrument) return null
  const source = formatCloudSourceName(fileName)
  const label = `${source} ${localInstrument.label}`
  const scriptUrl = `${WEBAUDIOFONT_SCRIPT_BASE_URL}${fileName.replace(/\.html$/, '.js')}`

  return {
    family: localInstrument.family,
    id: createOnlineWebAudioFontInstrumentId(scriptUrl, getWebAudioFontVariableName(fileName), label, program),
    imageInstrumentId: localInstrument.id,
    label,
    source: fileName,
  }
}

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
    const filteredInstruments = onlineInstruments.filter((instrument) => {
      if (!query) return true
      return `${instrument.label} ${instrument.family} ${instrument.source}`.toLowerCase().includes(query)
    })
    if (query) return filteredInstruments

    const recommendedInstruments = filteredInstruments.filter((instrument) => {
      return RECOMMENDED_CLOUD_NAMES.has(instrument.source)
    })
    return recommendedInstruments.length > 0 ? recommendedInstruments : filteredInstruments.slice(0, 24)
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
    if (!cloudOpen || onlineInstruments.length > 0 || !cloudAvailable) return

    let cancelled = false
    setCloudLoading(true)
    const abortController = new AbortController()
    const timeoutId = window.setTimeout(() => abortController.abort(), 7000)
    fetch(WEBAUDIOFONT_CATALOG_URL, { signal: abortController.signal })
      .then(async (response) => {
        window.clearTimeout(timeoutId)
        if (!response.ok) throw new Error(`Cloud catalog failed: ${response.status}`)
        const html = await response.text()
        const document = new DOMParser().parseFromString(html, 'text/html')
        return Array.from(document.querySelectorAll('a'))
          .map((link) => link.getAttribute('href') ?? link.textContent ?? '')
          .filter((fileName) => /^\d+_.+\.html$/.test(fileName))
          .map(createCloudInstrument)
          .filter((instrument): instrument is CloudInstrument => Boolean(instrument))
      })
      .then((instruments) => {
        if (cancelled) return
        if (instruments.length === 0) throw new Error('Cloud sources unavailable')
        setOnlineInstruments(instruments.sort((left, right) => left.label.localeCompare(right.label)))
      })
      .catch(() => {
        if (cancelled) return
        setCloudAvailable(false)
        setCloudOpen(false)
        window.alert('인터넷 연결이 없어 악기 모음을 불러올 수 없습니다.')
      })
      .finally(() => {
        if (!cancelled) setCloudLoading(false)
      })

    return () => {
      cancelled = true
      abortController.abort()
      window.clearTimeout(timeoutId)
    }
  }, [cloudAvailable, cloudOpen, onlineInstruments.length])

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
          <section className="instrument-cloud-window" aria-label="악기 모음">
            <header>
              <strong>악기 모음</strong>
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
              {!cloudLoading && cloudInstruments.length === 0 ? (
                <span className="instrument-cloud-status">검색 결과가 없습니다</span>
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
                  <img alt="" draggable={false} src={getInstrumentImage(instrument.imageInstrumentId)} />
                  <span>{instrument.label}</span>
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
            반주 악기
          </label>

          <div className="instrument-dialog-actions">
            <button
              type="button"
              onPointerDown={() => {
                if (cloudAvailable) {
                  setCloudOpen(true)
                  return
                }

                window.alert('인터넷 연결이 없어 악기 모음을 불러올 수 없습니다.')
              }}
            >
              악기 모음
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
