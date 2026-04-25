import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react'
import { getTrackPlacements, getTrackSourceEndBeat } from '../../../lib/arrangement/trackArrangement'
import { getInstrumentImage } from '../../../lib/midi/generalMidi'
import type {
  PatternPlacement,
  Project,
} from '../../../types/music'
import { getPitchName } from '../helpers'

type ArrangeViewProps = {
  addAutoMixSectionFromPointer: (event: ReactPointerEvent<HTMLElement>) => void
  addTrackPlacement: (trackId: string) => void
  arrangedProject: Project
  beginTrackPlacementDrag: (
    placement: PatternPlacement,
    event: ReactPointerEvent<HTMLElement>,
    type: 'move' | 'resize',
  ) => void
  deleteTrackPlacement: (placementId: string) => void
  focusTrackAtBeat: (trackId: string, beat: number) => void
  project: Project
  renderAutoMixCutOverlay: () => ReactNode
  rollSurfaceStyle: CSSProperties
  selectTrack: (trackId: string) => void
  selectedTrackId: string | undefined
  selectedTrackPlacementId: string | null
  totalBeats: number
  visibleBars: number
}

export function ArrangeView({
  addAutoMixSectionFromPointer,
  addTrackPlacement,
  arrangedProject,
  beginTrackPlacementDrag,
  deleteTrackPlacement,
  focusTrackAtBeat,
  project,
  renderAutoMixCutOverlay,
  rollSurfaceStyle,
  selectTrack,
  selectedTrackId,
  selectedTrackPlacementId,
  totalBeats,
  visibleBars,
}: ArrangeViewProps) {
  return (
    <div className="arrange-view" aria-label="편곡 배치" style={rollSurfaceStyle}>
      <header>
        <strong>배치</strong>
        <span>트랙 전체를 블록처럼 여러 번 배치하고, 그 배치대로 재생과 내보내기가 따라갑니다.</span>
        <div className="arrange-actions">
          <button
            type="button"
            disabled={!selectedTrackId}
            onPointerDown={() => {
              if (!selectedTrackId) return
              addTrackPlacement(selectedTrackId)
            }}
          >
            선택 트랙 배치 추가
          </button>
        </div>
      </header>
      <div className="arrange-summary">
        <article>
          <strong>{project.tracks.length}</strong>
          <span>전체 트랙</span>
        </article>
        <article>
          <strong>{project.tracks.filter((track) => track.kind === 'audio').length}</strong>
          <span>오디오 트랙</span>
        </article>
        <article>
          <strong>{Object.values(project.notesByTrack).reduce((count, notes) => count + notes.length, 0)}</strong>
          <span>음표 수</span>
        </article>
        <article>
          <strong>{(project.audioClips ?? []).length}</strong>
          <span>클립 수</span>
        </article>
      </div>
      <div className="arrange-help">
        <article>
          <strong>1. 전체 구조 확인</strong>
          <span>어느 트랙에 멜로디와 오디오가 얼마나 들어갔는지 빠르게 훑습니다.</span>
        </article>
        <article>
          <strong>2. 바로 편집으로 이동</strong>
          <span>파란 음표나 초록 오디오 클립을 누르면 그 트랙과 위치로 즉시 이동합니다.</span>
        </article>
        <article>
          <strong>3. 컷 위치 잡기</strong>
          <span>윗줄 빈 공간을 누르면 그 지점에 AutoMix 컷을 바로 추가할 수 있습니다.</span>
        </article>
      </div>
      <div className="arrange-timeline" onPointerDown={addAutoMixSectionFromPointer}>
        {renderAutoMixCutOverlay()}
        {Array.from({ length: visibleBars }, (_, bar) => (
          <span key={bar}>{bar + 1}</span>
        ))}
      </div>
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
                  ＋ 전체 트랙 배치
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
                    key={note.id}
                    title={`${track.name} · ${getPitchName(note.pitch)} · ${Math.round(note.startBeat * 100) / 100}박`}
                    onPointerDown={(event) => {
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
                    key={clip.id}
                    title={clip.name}
                    onPointerDown={(event) => {
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
