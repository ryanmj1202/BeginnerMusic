import { useState, type CSSProperties, type DragEvent } from 'react'
import type { AutoMixGenre, AutoMixSettings, Project } from '../../../types/music'
import { getInstrumentImage, getInstrumentLabel } from '../../../lib/midi/generalMidi'
import { AUTO_MIX_GENRES, getAutoMixRecommendedPriority, getAutoMixSettings } from '../utils/autoMixProject'

type AutoMixPanelProps = {
  applyAutoMix: () => void
  project: Project
  updateAutoMixSettings: (updates: Partial<AutoMixSettings>) => void
}

function getPriorityMap(trackOrder: string[]) {
  return Object.fromEntries(trackOrder.map((trackId, index) => [trackId, Math.max(1, 5 - index)]))
}

export function AutoMixPanel({
  applyAutoMix,
  project,
  updateAutoMixSettings,
}: AutoMixPanelProps) {
  const settings = getAutoMixSettings(project)
  const [dragTrackId, setDragTrackId] = useState<string | null>(null)
  const [dragOverTrackId, setDragOverTrackId] = useState<string | null>(null)
  const orderedTrackIds = [
    ...(settings.trackOrder ?? []).filter((trackId) => project.tracks.some((track) => track.id === trackId)),
    ...project.tracks.filter((track) => !(settings.trackOrder ?? []).includes(track.id)).map((track) => track.id),
  ]
  const orderedTracks = orderedTrackIds
    .map((trackId) => project.tracks.find((track) => track.id === trackId))
    .filter((track) => Boolean(track))

  function moveTrack(targetTrackId: string, event: DragEvent<HTMLElement>) {
    event.preventDefault()
    if (!dragTrackId || dragTrackId === targetTrackId) return
    const nextOrder = orderedTrackIds.filter((trackId) => trackId !== dragTrackId)
    const targetIndex = nextOrder.indexOf(targetTrackId)
    nextOrder.splice(targetIndex, 0, dragTrackId)
    updateAutoMixSettings({
      trackOrder: nextOrder,
      trackPriorities: getPriorityMap(nextOrder),
    })
    setDragOverTrackId(null)
  }

  function applyGenrePriority(genre: AutoMixGenre) {
    const nextOrder = [...project.tracks]
      .sort((left, right) => (
        getAutoMixRecommendedPriority(project, right, genre) - getAutoMixRecommendedPriority(project, left, genre)
      ))
      .map((track) => track.id)
    updateAutoMixSettings({
      recommendedGenre: genre,
      trackOrder: nextOrder,
      trackPriorities: getPriorityMap(nextOrder),
    })
  }

  return (
    <div className="auto-mix-panel">
      <header className="auto-mix-header">
        <div>
          <strong>악기 균형 조정</strong>
          <span>앞에 둔 악기일수록 자동 조정할 때 더 잘 들리게 합니다.</span>
        </div>
        <div className="auto-mix-actions">
          <button type="button" onPointerDown={applyAutoMix}>자동으로 맞추기</button>
        </div>
      </header>

      <div className="auto-mix-section-list">
        <div className="auto-mix-easy-controls">
          <div className="auto-mix-genre-buttons" aria-label="장르별 추천 순서">
            {AUTO_MIX_GENRES.map((genre) => (
              <button
                className={settings.recommendedGenre === genre.id ? 'is-active' : ''}
                key={genre.id}
                type="button"
                onPointerDown={() => applyGenrePriority(genre.id)}
              >
                {genre.label}
              </button>
            ))}
          </div>
          <label>
            <span>반영 정도</span>
            <i className="auto-mix-option-visual auto-mix-option-strength" aria-hidden="true" style={{ '--level': settings.strength } as CSSProperties}>
              <b />
              <b />
              <b />
            </i>
            <input type="range" min="0" max="1" step="0.05" value={settings.strength} onChange={(event) => updateAutoMixSettings({ strength: Number(event.target.value) })} />
          </label>
          <label>
            <span>울림</span>
            <i className="auto-mix-option-visual auto-mix-option-reverb" aria-hidden="true" style={{ '--level': settings.reverb } as CSSProperties}>
              <b>♪</b>
              <b>♪</b>
              <b>♪</b>
            </i>
            <input type="range" min="0" max="1" step="0.05" value={settings.reverb} onChange={(event) => updateAutoMixSettings({ reverb: Number(event.target.value) })} />
          </label>
          <label>
            <span>좌우 넓이</span>
            <i className="auto-mix-option-visual auto-mix-option-width" aria-hidden="true" style={{ '--level': settings.stereoWidth } as CSSProperties}>
              <b>♪</b>
              <b>♪</b>
            </i>
            <input type="range" min="0" max="1" step="0.05" value={settings.stereoWidth} onChange={(event) => updateAutoMixSettings({ stereoWidth: Number(event.target.value) })} />
          </label>
          <label>
            <span>소리 또렷함</span>
            <i className="auto-mix-option-visual auto-mix-option-brightness" aria-hidden="true" style={{ '--level': settings.brightness } as CSSProperties}>
              <b>♬</b>
            </i>
            <input type="range" min="0" max="1" step="0.05" value={settings.brightness} onChange={(event) => updateAutoMixSettings({ brightness: Number(event.target.value) })} />
          </label>
        </div>

        <div className="auto-mix-priority-grid">
          {orderedTracks.map((track) => {
            if (!track) return null

            return (
              <div
                className={[
                  'auto-mix-priority-card',
                  track.id === dragTrackId ? 'is-dragging' : '',
                  track.id === dragOverTrackId && track.id !== dragTrackId ? 'is-shift-target' : '',
                ].filter(Boolean).join(' ')}
                draggable
                key={track.id}
                onDragStart={() => setDragTrackId(track.id)}
                onDragEnd={() => {
                  setDragTrackId(null)
                  setDragOverTrackId(null)
                }}
                onDragLeave={() => {
                  if (dragOverTrackId === track.id) setDragOverTrackId(null)
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  if (dragTrackId && dragTrackId !== track.id) setDragOverTrackId(track.id)
                }}
                onDrop={(event) => moveTrack(track.id, event)}
              >
                <span className="auto-mix-instrument-name">
                  <img alt="" draggable={false} src={getInstrumentImage(track.instrumentId)} />
                  <strong>{getInstrumentLabel(track.instrumentId)}</strong>
                  <small>{track.name}</small>
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
