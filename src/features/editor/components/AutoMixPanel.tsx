import type { ReactNode } from 'react'
import { getInstrumentLabel } from '../../../lib/midi/generalMidi'
import type {
  AutoMixSection,
  Project,
} from '../../../types/music'
import {
  AUTO_MIX_GENRE_PRESETS,
  BEATS_PER_BAR,
} from '../constants'
import type {
  AutoMixGenrePreset,
  AutoMixReportItem,
} from '../types'

type AutoMixPanelProps = {
  addAutoMixSection: () => void
  applyAutoMixGenrePreset: (nextGenre: AutoMixGenrePreset) => void
  autoMixGenrePreset: AutoMixGenrePreset
  autoMixReport: AutoMixReportItem[]
  deleteAutoMixSection: (sectionId: string) => void
  focusAutoMixSection: (sectionId: string) => void
  getAutoMixFocusTrackId: (section: AutoMixSection) => string
  isAutoMixing: boolean
  project: Project
  renderAutoMixCutOverlay: () => ReactNode
  runAutoMixTracks: () => Promise<void>
  selectedAutoMixSectionId: string | null
  setAutoMixFocusTrack: (sectionId: string, trackId: string) => void
  updateAutoMixSection: (sectionId: string, updates: Partial<AutoMixSection>) => void
}

export function AutoMixPanel({
  addAutoMixSection,
  applyAutoMixGenrePreset,
  autoMixGenrePreset,
  autoMixReport,
  deleteAutoMixSection,
  focusAutoMixSection,
  getAutoMixFocusTrackId,
  isAutoMixing,
  project,
  renderAutoMixCutOverlay,
  runAutoMixTracks,
  selectedAutoMixSectionId,
  setAutoMixFocusTrack,
  updateAutoMixSection,
}: AutoMixPanelProps) {
  return (
    <div className="automix-view" aria-label="믹스 우선순위">
      <header>
        <strong>믹스 우선순위</strong>
        <span>컷을 나누고 구간마다 중심 트랙을 고르면 자동 믹스가 그 구간의 밸런스를 다시 맞춥니다.</span>
      </header>
      <div className="automix-view-actions">
        <button type="button" onPointerDown={addAutoMixSection}>＋ 컷 추가 (C)</button>
        <label className="automix-genre-select">
          <span>장르 추천</span>
          <select
            value={autoMixGenrePreset}
            onChange={(event) => applyAutoMixGenrePreset(event.target.value as AutoMixGenrePreset)}
          >
            {AUTO_MIX_GENRE_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.label}</option>
            ))}
          </select>
        </label>
        <button type="button" disabled={isAutoMixing} onPointerDown={() => void runAutoMixTracks()}>
          {isAutoMixing ? '자동 믹스 중...' : '자동 믹스 적용'}
        </button>
      </div>
      {renderAutoMixCutOverlay()}
      <div className="automix-explain">
        <strong>자동 믹스는 트랙 음량, 구간별 음표 음량, 좌우 위치를 조정합니다.</strong>
        <span>발라드, 록, 힙합 같은 장르 추천을 먼저 적용한 뒤, 컷마다 중심 트랙만 바꾸면 훨씬 빠르게 정리됩니다.</span>
      </div>
      {autoMixReport.length > 0 ? (
        <div className="automix-report-grid">
          {autoMixReport.map((item) => {
            const track = project.tracks.find((currentTrack) => currentTrack.id === item.trackId)
            if (!track) return null

            return (
              <article className="automix-report-card" key={item.trackId}>
                <span>{track.name}</span>
                <strong>{item.role}</strong>
                <div className="report-meter">
                  <span style={{ width: `${Math.round(item.afterVolume * 100)}%` }} />
                </div>
                <em>
                  음량 {Math.round(item.beforeVolume * 100)} → {Math.round(item.afterVolume * 100)}
                  {' · '}
                  {item.afterPan < -0.01 ? `왼쪽 ${Math.round(Math.abs(item.afterPan) * 100)}` : item.afterPan > 0.01 ? `오른쪽 ${Math.round(item.afterPan * 100)}` : '가운데'}
                  {' · '}
                  음표 {item.noteChanges}개 보정
                </em>
              </article>
            )
          })}
        </div>
      ) : null}
      {(project.autoMixSections ?? []).length === 0 ? (
        <div className="automix-empty">
          <strong>아직 정한 컷이 없습니다.</strong>
          <span>이 상태에서 자동 믹스를 누르면 드럼과 베이스를 조금 앞에 두는 기본 우선순위가 적용됩니다.</span>
        </div>
      ) : (
        <div className="automix-view-list">
          {(project.autoMixSections ?? []).map((section) => (
            <article className={section.id === selectedAutoMixSectionId ? 'automix-section is-selected' : 'automix-section'} key={section.id}>
              <div className="automix-section-top">
                <input
                  aria-label="구간 이름"
                  value={section.name}
                  onFocus={() => focusAutoMixSection(section.id)}
                  onChange={(event) => updateAutoMixSection(section.id, { name: event.target.value })}
                />
                <button type="button" onPointerDown={() => deleteAutoMixSection(section.id)}>삭제</button>
              </div>
              <div className="automix-section-grid">
                <label>
                  <span>시작 마디</span>
                  <input
                    min={1}
                    step={0.25}
                    type="number"
                    value={Number((section.startBeat / BEATS_PER_BAR + 1).toFixed(2))}
                    onChange={(event) => updateAutoMixSection(section.id, {
                      startBeat: Math.max(0, (Number(event.target.value) - 1) * BEATS_PER_BAR),
                    })}
                  />
                </label>
                <label>
                  <span>끝 마디</span>
                  <input
                    min={1.25}
                    step={0.25}
                    type="number"
                    value={Number((section.endBeat / BEATS_PER_BAR + 1).toFixed(2))}
                    onChange={(event) => updateAutoMixSection(section.id, {
                      endBeat: Math.max(0.25, (Number(event.target.value) - 1) * BEATS_PER_BAR),
                    })}
                  />
                </label>
                <label>
                  <span>강도 {Math.round(section.intensity * 100)}</span>
                  <input
                    max={1}
                    min={0}
                    step={0.05}
                    type="range"
                    value={section.intensity}
                    onChange={(event) => updateAutoMixSection(section.id, { intensity: Number(event.target.value) })}
                  />
                </label>
              </div>
              <label className="automix-focus-select">
                <span>중심 트랙</span>
                <select
                  value={getAutoMixFocusTrackId(section)}
                  onChange={(event) => setAutoMixFocusTrack(section.id, event.target.value)}
                >
                  {project.tracks.map((track, index) => (
                    <option key={track.id} value={track.id}>
                      트랙 {index + 1} · {getInstrumentLabel(track.instrumentId)}
                    </option>
                  ))}
                </select>
              </label>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
