import type { PointerEvent as ReactPointerEvent } from 'react'
import { BEATS_PER_BAR } from '../constants'
import type { AutoMixSection } from '../../../types/music'

type AutoMixCutOverlayProps = {
  autoMixMarkerSections: AutoMixSection[]
  focusAutoMixSection: (sectionId: string) => void
  selectedAutoMixSectionId: string | null
  totalBeats: number
}

export function AutoMixCutOverlay({
  autoMixMarkerSections,
  focusAutoMixSection,
  selectedAutoMixSectionId,
  totalBeats,
}: AutoMixCutOverlayProps) {
  if (autoMixMarkerSections.length === 0) return null

  return (
    <div className="automix-cut-overlay" aria-label="자동 믹스 컷 표시">
      {autoMixMarkerSections.map((section, index) => {
        const left = Math.min(100, Math.max(0, (section.startBeat / totalBeats) * 100))
        const right = Math.min(100, Math.max(0, (section.endBeat / totalBeats) * 100))
        const width = Math.max(0.8, right - left)
        const isSelected = section.id === selectedAutoMixSectionId

        function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
          event.preventDefault()
          event.stopPropagation()
          focusAutoMixSection(section.id)
        }

        return (
          <button
            type="button"
            className={isSelected ? 'automix-cut-marker is-selected' : 'automix-cut-marker'}
            key={section.id}
            style={{ left: `${left}%`, width: `${width}%` }}
            title={`${section.name} · ${Math.round(section.intensity * 100)}%`}
            onPointerDown={handlePointerDown}
          >
            <strong>{section.name || `컷 ${index + 1}`}</strong>
            <span>{Math.floor(section.startBeat / BEATS_PER_BAR) + 1} ~ {Math.ceil(section.endBeat / BEATS_PER_BAR)}</span>
          </button>
        )
      })}
    </div>
  )
}
