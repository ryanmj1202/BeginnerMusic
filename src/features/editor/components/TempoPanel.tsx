import type {
  CSSProperties,
  Dispatch,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  SetStateAction,
} from 'react'
import type { TempoSection } from '../../../types/music'
import {
  BEATS_PER_BAR,
  TEMPO_GRAPH_MAX,
  TEMPO_GRAPH_MIN,
  TEMPO_INPUT_MAX,
  TEMPO_INPUT_MIN,
} from '../constants'

type TempoPanelProps = {
  addTempoSection: () => void
  changeTempoFromGraph: (event: ReactPointerEvent<HTMLDivElement>) => void
  changeTempoInput: (value: string) => void
  commitTempoInput: () => void
  deleteTempoSection: (sectionId: string) => void
  focusTempoSection: (sectionId: string) => void
  projectTempo: number
  renderTempoSectionOverlay: () => ReactNode
  rollSurfaceStyle: CSSProperties
  selectedTempoSection: TempoSection | null
  setSelectedTempoSectionId: Dispatch<SetStateAction<string | null>>
  tempoInput: string
  tempoSections: TempoSection[]
  updateTempo: (tempo: number) => void
  updateTempoSection: (sectionId: string, updates: Partial<TempoSection>) => void
}

export function TempoPanel({
  addTempoSection,
  changeTempoFromGraph,
  changeTempoInput,
  commitTempoInput,
  deleteTempoSection,
  focusTempoSection,
  projectTempo,
  renderTempoSectionOverlay,
  rollSurfaceStyle,
  selectedTempoSection,
  setSelectedTempoSectionId,
  tempoInput,
  tempoSections,
  updateTempo,
  updateTempoSection,
}: TempoPanelProps) {
  const currentTempo = selectedTempoSection?.tempo ?? projectTempo

  return (
    <div className="tempo-view" aria-label="템포" style={rollSurfaceStyle}>
      <header>
        <strong>템포</strong>
        <span>곡 전체나 선택한 구간의 BPM을 조절합니다.</span>
      </header>
      <div className="tempo-overview">
        <article>
          <strong>{projectTempo}</strong>
          <span>기본 템포</span>
        </article>
        <article>
          <strong>{tempoSections.length}</strong>
          <span>구간 수</span>
        </article>
        <article>
          <strong>{currentTempo}</strong>
          <span>{selectedTempoSection ? '선택 구간' : '현재 BPM'}</span>
        </article>
      </div>
      <div className="tempo-graph" onPointerDown={changeTempoFromGraph}>
        {renderTempoSectionOverlay()}
        <span className="tempo-graph-min">{TEMPO_GRAPH_MIN}</span>
        <span className="tempo-graph-max">{TEMPO_GRAPH_MAX}</span>
        <span
          className="tempo-graph-fill"
          style={{ height: `${Math.min(100, Math.max(0, ((currentTempo - TEMPO_GRAPH_MIN) / (TEMPO_GRAPH_MAX - TEMPO_GRAPH_MIN)) * 100))}%` }}
        />
        <span
          className="tempo-graph-handle"
          style={{ bottom: `${Math.min(100, Math.max(0, ((currentTempo - TEMPO_GRAPH_MIN) / (TEMPO_GRAPH_MAX - TEMPO_GRAPH_MIN)) * 100))}%` }}
        >
          {currentTempo} BPM
        </span>
      </div>
      <div className="tempo-section-actions">
        <button type="button" onPointerDown={() => addTempoSection()}>＋ 구간 추가</button>
        <button type="button" onPointerDown={() => setSelectedTempoSectionId(null)}>전체 BPM</button>
        <span>구간을 선택하면 그 부분의 BPM만 따로 바꿀 수 있습니다.</span>
      </div>
      {tempoSections.length > 0 ? (
        <div className="tempo-section-list">
          {tempoSections.map((section) => (
            <article className={section.id === selectedTempoSection?.id ? 'tempo-section-card is-selected' : 'tempo-section-card'} key={section.id}>
              <div className="tempo-section-top">
                <input
                  aria-label="구간 이름"
                  value={section.name}
                  onFocus={() => focusTempoSection(section.id)}
                  onChange={(event) => updateTempoSection(section.id, { name: event.target.value })}
                />
                <button type="button" onPointerDown={() => deleteTempoSection(section.id)}>삭제</button>
              </div>
              <div className="tempo-section-grid">
                <label>
                  <span>시작</span>
                  <input
                    min={1}
                    step={0.25}
                    type="number"
                    value={Number((section.startBeat / BEATS_PER_BAR + 1).toFixed(2))}
                    onChange={(event) => updateTempoSection(section.id, { startBeat: Math.max(0, (Number(event.target.value) - 1) * BEATS_PER_BAR) })}
                  />
                </label>
                <label>
                  <span>끝</span>
                  <input
                    min={1.25}
                    step={0.25}
                    type="number"
                    value={Number((section.endBeat / BEATS_PER_BAR + 1).toFixed(2))}
                    onChange={(event) => updateTempoSection(section.id, { endBeat: Math.max(0.25, (Number(event.target.value) - 1) * BEATS_PER_BAR) })}
                  />
                </label>
                <label>
                  <span>BPM</span>
                  <input
                    min={TEMPO_INPUT_MIN}
                    max={TEMPO_INPUT_MAX}
                    step={1}
                    type="number"
                    value={section.tempo}
                    onChange={(event) => updateTempoSection(section.id, { tempo: Number(event.target.value) })}
                  />
                </label>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="tempo-empty">
          <strong>아직 나눈 구간이 없습니다.</strong>
          <span>필요 없으면 전체 BPM만 바꿔도 됩니다.</span>
        </div>
      )}
      <div className="tempo-view-controls">
        <button type="button" onPointerDown={() => updateTempo(currentTempo - 1)}>−</button>
        <input
          aria-label="BPM"
          inputMode="numeric"
          type="text"
          value={tempoInput}
          onBlur={commitTempoInput}
          onChange={(event) => changeTempoInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
        <button type="button" onPointerDown={() => updateTempo(currentTempo + 1)}>＋</button>
      </div>
    </div>
  )
}
