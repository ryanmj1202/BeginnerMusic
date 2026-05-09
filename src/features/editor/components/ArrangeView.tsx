import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
} from 'react'
import { getTrackPlacements, getTrackSourceEndBeat } from '../../../lib/arrangement/trackArrangement'
import { getInstrumentImage } from '../../../lib/midi/generalMidi'
import type {
  AutoMixSection,
  PatternPlacement,
  Project,
} from '../../../types/music'

type ArrangeViewProps = {
  addTrackPlacement: (trackId: string) => void
  arrangedProject: Project
  autoMixSections: AutoMixSection[]
  beginTrackPlacementDrag: (
    placement: PatternPlacement,
    event: ReactPointerEvent<HTMLElement>,
    type: 'move' | 'resize',
  ) => void
  deleteAutoMixSection: (sectionId: string) => void
  deleteTrackPlacement: (placementId: string) => void
  focusTrackAtBeat: (trackId: string, beat: number) => void
  project: Project
  rollSurfaceStyle: CSSProperties
  selectTrack: (trackId: string) => void
  selectAutoMixSection: (sectionId: string) => void
  selectedAutoMixSectionId: string | null
  selectedTrackId: string | undefined
  selectedTrackPlacementId: string | null
  totalBeats: number
  visibleBars: number
}

export function ArrangeView({
  addTrackPlacement,
  arrangedProject,
  autoMixSections,
  beginTrackPlacementDrag,
  deleteAutoMixSection,
  deleteTrackPlacement,
  focusTrackAtBeat,
  project,
  rollSurfaceStyle,
  selectTrack,
  selectAutoMixSection,
  selectedAutoMixSectionId,
  selectedTrackId,
  selectedTrackPlacementId,
  totalBeats,
  visibleBars,
}: ArrangeViewProps) {
  return (
    <div className="arrange-view" aria-label="음악 구성" style={rollSurfaceStyle}>
      <header>
        <strong>음악 구성</strong>
        <span>악기별 블록을 배치해 곡의 흐름을 만듭니다.</span>
        <div className="arrange-actions">
          <button
            type="button"
            disabled={!selectedTrackId}
            onPointerDown={() => {
              if (!selectedTrackId) return
              addTrackPlacement(selectedTrackId)
            }}
          >
            선택한 악기 블록 추가
          </button>
        </div>
      </header>
      <div className="arrange-summary">
        <article>
          <strong>{project.tracks.length}</strong>
          <span>악기 수</span>
        </article>
        <article>
          <strong>{project.tracks.filter((track) => track.kind === 'audio').length}</strong>
          <span>소리 파일 악기</span>
        </article>
        <article>
          <strong>{Object.values(project.notesByTrack).reduce((count, notes) => count + notes.length, 0)}</strong>
          <span>음 수</span>
        </article>
        <article>
          <strong>{(project.audioClips ?? []).length}</strong>
          <span>소리 파일</span>
        </article>
      </div>
      <div className="arrange-help">
        <article>
          <strong>1. 전체 보기</strong>
          <span>악기별 멜로디와 소리 파일이 어디에 있는지 확인합니다.</span>
        </article>
        <article>
          <strong>2. 바로 편집하기</strong>
          <span>음표나 소리 파일을 누르면 해당 위치로 이동합니다.</span>
        </article>
      </div>
      <div className="arrange-timeline">
        {Array.from({ length: visibleBars }, (_, bar) => (
          <span key={bar}>{bar + 1}</span>
        ))}
      </div>
      {false ? (
        <div className="arrange-cut-lane" aria-label="자동 믹스 구간">
          <span>커트</span>
          <div className="arrange-cut-grid">
            {autoMixSections.map((section) => (
              <button
                type="button"
                className={section.id === selectedAutoMixSectionId ? 'is-selected' : ''}
                key={section.id}
                onPointerDown={() => selectAutoMixSection(section.id)}
                style={{
                  left: `${(section.startBeat / totalBeats) * 100}%`,
                  width: `${Math.max(3, ((section.endBeat - section.startBeat) / totalBeats) * 100)}%`,
                }}
              >
                <span>{section.name}</span>
                <span
                  className="arrange-cut-delete"
                  onPointerDown={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    deleteAutoMixSection(section.id)
                  }}
                  role="button"
                  aria-label={`${section.name} 삭제`}
                >
                  ×
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="arrange-lanes">
        {project.tracks.map((track) => {
          const notes = arrangedProject.notesByTrack[track.id] ?? []
          const clips = (arrangedProject.audioClips ?? []).filter((clip) => clip.trackId === track.id)
          const placements = getTrackPlacements(project, track.id)
          const sourceLengthBeats = getTrackSourceEndBeat(project, track.id)

          return (
            <div className="arrange-lane" key={track.id}>
              <button
                type="button"
                className={track.id === project.selectedTrackId ? 'is-active' : ''}
                onPointerDown={() => selectTrack(track.id)}
              >
                <img alt="" draggable={false} src={getInstrumentImage(track.instrumentId)} />
                <span>{track.name}</span>
              </button>
              <div className="arrange-lane-grid">
                <button
                  type="button"
                  className="arrange-add-placement"
                  onPointerDown={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    addTrackPlacement(track.id)
                  }}
                >
                  ＋ 전체 블록
                </button>
                {placements.map((placement) => (
                  <div
                    className={placement.id === selectedTrackPlacementId ? 'arrange-track-placement is-selected' : 'arrange-track-placement'}
                    key={placement.id}
                    onPointerDown={(event) => beginTrackPlacementDrag(placement, event, 'move')}
                    role="button"
                    tabIndex={0}
                    style={{
                      left: `${(placement.startBeat / totalBeats) * 100}%`,
                      width: `${Math.max(3, (placement.spanBeats / totalBeats) * 100)}%`,
                    }}
                  >
                    <strong>{track.name}</strong>
                    <span>{Math.round(placement.spanBeats * 100) / 100}박</span>
                    <em>원본 {Math.round(sourceLengthBeats * 100) / 100}박</em>
                    <button
                      type="button"
                      className="arrange-track-placement-delete"
                      onPointerDown={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        deleteTrackPlacement(placement.id)
                      }}
                    >
                      ×
                    </button>
                    <span
                      className="arrange-track-placement-resize"
                      onPointerDown={(event) => beginTrackPlacementDrag(placement, event, 'resize')}
                    />
                  </div>
                ))}
                {notes.map((note) => (
                  <button
                    type="button"
                    className="arrange-note"
                    key={note.id}                    onPointerDown={(event) => {
                      event.preventDefault()
                      focusTrackAtBeat(track.id, note.startBeat)
                    }}
                    style={{
                      left: `${(note.startBeat / totalBeats) * 100}%`,
                      width: `${(note.durationBeats / totalBeats) * 100}%`,
                    }}
                  />
                ))}
                {clips.map((clip) => (
                  <button
                    type="button"
                    className="arrange-audio-clip"
                    key={clip.id}                    onPointerDown={(event) => {
                      event.preventDefault()
                      focusTrackAtBeat(track.id, clip.startBeat)
                    }}
                    style={{
                      left: `${(clip.startBeat / totalBeats) * 100}%`,
                      width: `${(clip.durationBeats / totalBeats) * 100}%`,
                    }}
                  >
                    <span className="arrange-audio-waveform" aria-hidden="true">
                      {(clip.waveform?.length ? clip.waveform : Array.from({ length: 32 }, () => 0.28)).slice(0, 48).map((peak, barIndex) => (
                        <i
                          key={barIndex}
                          style={{ height: `${Math.max(12, Math.min(100, peak * clip.volume * 100))}%` }}
                        />
                      ))}
                    </span>
                    <em>{clip.name}</em>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
