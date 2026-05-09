import type { PointerEvent as ReactPointerEvent } from 'react'
import type { TempoSection } from '../../../types/music'

type TempoSectionOverlayProps = {
  focusTempoSection: (sectionId: string) => void
  selectedTempoSectionId: string | null
  tempoSections: TempoSection[]
  totalBeats: number
}

export function TempoSectionOverlay({
  focusTempoSection,
  selectedTempoSectionId,
  tempoSections,
  totalBeats,
}: TempoSectionOverlayProps) {
  if (tempoSections.length === 0) return null

  return (
    <div className="tempo-section-overlay" aria-label="템포 구간 표시">
      {tempoSections.map((section, index) => {
        const left = Math.min(100, Math.max(0, (section.startBeat / totalBeats) * 100))
        const right = Math.min(100, Math.max(0, (section.endBeat / totalBeats) * 100))
        const width = Math.max(1.2, right - left)
        const isSelected = section.id === selectedTempoSectionId

        function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
          event.preventDefault()
          event.stopPropagation()
          focusTempoSection(section.id)
        }

        return (
          <button
            type="button"
            className={isSelected ? 'tempo-section-marker is-selected' : 'tempo-section-marker'}
            key={section.id}
            style={{ left: `${left}%`, width: `${width}%` }}            onPointerDown={handlePointerDown}
          >
            <strong>{section.name || `템포 ${index + 1}`}</strong>
            <span>{section.tempo} BPM</span>
          </button>
        )
      })}
    </div>
  )
}