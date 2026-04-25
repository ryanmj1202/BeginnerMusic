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
  renderAutoMixCutOverlay: () => ReactNode
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
  renderAutoMixCutOverlay,
  renderTempoSectionOverlay,
  rollSurfaceStyle,
  selectedTempoSection,
  setSelectedTempoSectionId,
  tempoInput,
  tempoSections,
  updateTempo,
  updateTempoSection,
}: TempoPanelProps) {
  return (
    <div className="tempo-view" aria-label="템포 편집" style={rollSurfaceStyle}>
      <header>
        <strong>빠르기</strong>
        <span>기본 BPM만 바꾸는 화면이 아니라, 구간별 빠르기 흐름을 나눠서 관리하는 화면입니다.</span>
      </header>
      <div className="tempo-overview">
        <article>
          <strong>{projectTempo}</strong>
          <span>기본 BPM</span>
        </article>
        <article>
          <strong>{tempoSections.length}</strong>
          <span>빠르기 구간</span>
        </article>
        <article>
          <strong>{selectedTempoSection ? selectedTempoSection.tempo : projectTempo}</strong>
          <span>{selectedTempoSection ? '선택한 구간 BPM' : '현재 편집 BPM'}</span>
        </article>
      </div>
      <div className="tempo-graph" onPointerDown={changeTempoFromGraph}>
        {renderAutoMixCutOverlay()}
        {renderTempoSectionOverlay()}
        <span className="tempo-graph-min">{TEMPO_GRAPH_MIN}</span>
        <span className="tempo-graph-max">{TEMPO_GRAPH_MAX}</span>
        <span
          className="tempo-graph-fill"
          style={{ height: `${Math.min(100, Math.max(0, (((selectedTempoSection?.tempo ?? projectTempo) - TEMPO_GRAPH_MIN) / (TEMPO_GRAPH_MAX - TEMPO_GRAPH_MIN)) * 100))}%` }}
        />
        <span
          className="tempo-graph-handle"
          style={{ bottom: `${Math.min(100, Math.max(0, (((selectedTempoSection?.tempo ?? projectTempo) - TEMPO_GRAPH_MIN) / (TEMPO_GRAPH_MAX - TEMPO_GRAPH_MIN)) * 100))}%` }}
        >
          {selectedTempoSection ? `${selectedTempoSection.tempo} BPM` : `${projectTempo} BPM`}
        </span>
      </div>
      <div className="tempo-section-actions">
        <button type="button" onPointerDown={() => addTempoSection()}>＋ 빠르기 구간 추가</button>
        <button type="button" onPointerDown={() => setSelectedTempoSectionId(null)}>기본 BPM 편집</button>
        <span>구간을 하나 만든 뒤 선택하면 그래프와 숫자 입력으로 그 구간 BPM을 바로 다듬을 수 있습니다.</span>
      </div>
      {tempoSections.length > 0 ? (
        <div className="tempo-section-list">
          {tempoSections.map((section) => (
            <article className={section.id === selectedTempoSection?.id ? 'tempo-section-card is-selected' : 'tempo-section-card'} key={section.id}>
              <div className="tempo-section-top">
                <input
                  aria-label="빠르기 구간 이름"
                  value={section.name}
                  onFocus={() => focusTempoSection(section.id)}
                  onChange={(event) => updateTempoSection(section.id, { name: event.target.value })}
                />
                <button type="button" onPointerDown={() => deleteTempoSection(section.id)}>삭제</button>
              </div>
              <div className="tempo-section-grid">
                <label>
                  <span>시작 마디</span>
                  <input
                    min={1}
                    step={0.25}
                    type="number"
                    value={Number((section.startBeat / BEATS_PER_BAR + 1).toFixed(2))}
                    onChange={(event) => updateTempoSection(section.id, { startBeat: Math.max(0, (Number(event.target.value) - 1) * BEATS_PER_BAR) })}
                  />
                </label>
                <label>
                  <span>끝 마디</span>
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
          <strong>아직 빠르기 구간이 없습니다.</strong>
          <span>전체 곡 BPM만 쓸 수도 있지만, 도입부와 후렴처럼 느낌이 달라지면 구간을 나눠 두는 편이 훨씬 낫습니다.</span>
        </div>
      )}
      <div className="tempo-view-controls">
        <button type="button" onPointerDown={() => updateTempo((selectedTempoSection?.tempo ?? projectTempo) - 1)}>−</button>
        <input
          aria-label="빠르기"
          inputMode="numeric"
          type="text"
          value={tempoInput}
          onBlur={commitTempoInput}
          onChange={(event) => changeTempoInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
        <button type="button" onPointerDown={() => updateTempo((selectedTempoSection?.tempo ?? projectTempo) + 1)}>＋</button>
      </div>
    </div>
  )
}
