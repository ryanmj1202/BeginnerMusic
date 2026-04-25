import type {
  CSSProperties,
  Dispatch,
  MouseEvent as ReactMouseEvent,
  SetStateAction,
} from 'react'
import {
  getInstrumentImage,
  getInstrumentLabel,
} from '../../../lib/midi/generalMidi'
import type {
  AutoMixSection,
  Project,
  Track,
} from '../../../types/music'
import {
  AUTO_MIX_GENRE_PRESETS,
  BEATS_PER_BAR,
  TRACK_COLORS,
} from '../constants'
import type {
  AutoMixGenrePreset,
  AutoMixReportItem,
} from '../types'

type TrackPanelProps = {
  addAutoMixSection: () => void
  addTrack: () => void
  allTrackMelodyMode: boolean
  applyAutoMixGenrePreset: (nextGenre: AutoMixGenrePreset) => void
  autoMixGenrePreset: AutoMixGenrePreset
  autoMixPanelOpen: boolean
  autoMixReport: AutoMixReportItem[]
  deleteAutoMixSection: (sectionId: string) => void
  focusAutoMixSection: (sectionId: string) => void
  getAutoMixFocusTrackId: (section: AutoMixSection) => string
  isAutoMixing: boolean
  isRecordingVoice: boolean
  openAudioUpload: () => void
  openInstrumentDialog: (track: Track) => void
  openTrackContextMenu: (trackId: string, event: ReactMouseEvent<HTMLElement>) => void
  openTrackPanelContextMenu: (event: ReactMouseEvent<HTMLElement>) => void
  project: Project
  runAutoMixTracks: () => Promise<void>
  selectTrack: (trackId: string) => void
  selectedAutoMixSectionId: string | null
  selectedTrackName: string
  setAllTrackMelodyMode: Dispatch<SetStateAction<boolean>>
  setAutoMixFocusTrack: (sectionId: string, trackId: string) => void
  setAutoMixPanelOpen: Dispatch<SetStateAction<boolean>>
  toggleVoiceRecording: () => Promise<void>
  totalBeats: number
  updateAutoMixSection: (sectionId: string, updates: Partial<AutoMixSection>) => void
  updateTrack: (trackId: string, updates: Partial<Track>) => void
}

export function TrackPanel({
  addAutoMixSection,
  addTrack,
  allTrackMelodyMode,
  applyAutoMixGenrePreset,
  autoMixGenrePreset,
  autoMixPanelOpen,
  autoMixReport,
  deleteAutoMixSection,
  focusAutoMixSection,
  getAutoMixFocusTrackId,
  isAutoMixing,
  isRecordingVoice,
  openAudioUpload,
  openInstrumentDialog,
  openTrackContextMenu,
  openTrackPanelContextMenu,
  project,
  runAutoMixTracks,
  selectTrack,
  selectedAutoMixSectionId,
  selectedTrackName,
  setAllTrackMelodyMode,
  setAutoMixFocusTrack,
  setAutoMixPanelOpen,
  toggleVoiceRecording,
  totalBeats,
  updateAutoMixSection,
  updateTrack,
}: TrackPanelProps) {
  return (
    <aside className="track-panel" aria-label="트랙 목록" onContextMenu={openTrackPanelContextMenu}>
      <div className="track-toolbar">
        <button type="button" className="back-button">‹</button>
        <strong>{selectedTrackName}</strong>
        <button type="button" className="menu-button">☰</button>
      </div>
      <label className="track-mode-toggle">
        <input
          type="checkbox"
          checked={allTrackMelodyMode}
          onChange={(event) => setAllTrackMelodyMode(event.target.checked)}
        />
        <span>전체 트랙 멜로디 편집</span>
      </label>

      <div className="track-list" onContextMenu={openTrackPanelContextMenu}>
        {project.tracks.map((track, index) => (
          <article
            className={track.id === project.selectedTrackId ? 'track-item is-selected' : 'track-item'}
            key={track.id}
            onPointerDown={(event) => {
              if (event.button !== 0) return
              selectTrack(track.id)
            }}
            onContextMenu={(event) => openTrackContextMenu(track.id, event)}
            style={{ '--track-color': track.color ?? TRACK_COLORS[0] } as CSSProperties}
          >
            <button
              type="button"
              className="instrument-image"
              aria-label={`${getInstrumentLabel(track.instrumentId)} 악기 변경`}
              onPointerDown={(event) => {
                if (event.button !== 0) return
                event.preventDefault()
                event.stopPropagation()
                openInstrumentDialog(track)
              }}
            >
              <img
                alt=""
                draggable={false}
                src={getInstrumentImage(track.instrumentId)}
              />
            </button>

            <div className="track-copy">
              <strong>트랙 {index + 1}</strong>
              <span>{getInstrumentLabel(track.instrumentId)}</span>
            </div>

            <div className="track-mix-readout" aria-label="믹스 상태">
              <span className="track-volume-meter">
                <span style={{ width: `${Math.round(Math.min(1, track.volume) * 100)}%` }} />
              </span>
              <small>
                음량 {Math.round(track.volume * 100)}
                {track.pan !== undefined && Math.abs(track.pan) > 0.01
                  ? ` · ${track.pan < 0 ? '왼쪽' : '오른쪽'} ${Math.round(Math.abs(track.pan) * 100)}`
                  : ' · 가운데'}
              </small>
            </div>

            <label
              className="track-volume-control"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <span>음량</span>
              <input
                aria-label={`${track.name} 음량`}
                type="range"
                min="0"
                max="1.2"
                step="0.01"
                value={track.volume}
                onChange={(event) => updateTrack(track.id, { volume: Number(event.target.value) })}
              />
              <em>{Math.round(track.volume * 100)}</em>
            </label>

            <div className="mini-actions" aria-label="트랙 제어">
              <button
                type="button"
                title="미리듣기"
                onPointerDown={(event) => event.stopPropagation()}
              >
                ⌕
              </button>
              <button
                type="button"
                className={track.mute ? 'is-muted' : ''}
                title="음소거"
                onPointerDown={(event) => {
                  event.stopPropagation()
                  updateTrack(track.id, { mute: !track.mute })
                }}
              >
                {track.mute ? '×' : '♪'}
              </button>
              <button
                type="button"
                title="레이어"
                onPointerDown={(event) => event.stopPropagation()}
              >
                ◆
              </button>
              <select
                aria-label="채널"
                value={track.channel ?? index + 1}
                onChange={(event) => updateTrack(track.id, { channel: Number(event.target.value) })}
                onPointerDown={(event) => event.stopPropagation()}
              >
                {Array.from({ length: 16 }, (_, channelIndex) => (
                  <option key={channelIndex + 1} value={channelIndex + 1}>
                    채널 {channelIndex + 1}
                  </option>
                ))}
              </select>
            </div>
          </article>
        ))}
        <button type="button" className="add-track-button" onPointerDown={addTrack}>＋ 트랙 추가</button>
        <div className="automix-panel">
          <div className="audio-actions">
            <button type="button" onPointerDown={openAudioUpload}>오디오 넣기</button>
            <button
              type="button"
              className={isRecordingVoice ? 'is-recording' : ''}
              onPointerDown={() => void toggleVoiceRecording()}
            >
              {isRecordingVoice ? '녹음 끝내기' : '음성 녹음'}
            </button>
          </div>
          <div className="automix-actions">
            <button type="button" className="automix-track-button" disabled={isAutoMixing} onPointerDown={() => void runAutoMixTracks()}>
              <span className="automix-track-icon-stack" aria-hidden="true">
                <img alt="" draggable={false} src="/instrument-icons/fx.svg" />
                <i />
              </span>
              <span className="automix-track-copy">
                <strong>{isAutoMixing ? '자동 믹스 진행 중' : 'AutoMix'}</strong>
                <small>트랙 밸런스와 좌우 위치 자동 정리</small>
              </span>
            </button>
            <button
              type="button"
              className={autoMixPanelOpen ? 'automix-toggle is-open' : 'automix-toggle'}
              onPointerDown={() => setAutoMixPanelOpen((open) => !open)}
            >
              우선순위
            </button>
          </div>

          {autoMixPanelOpen ? (
            <div className="automix-priority-panel" aria-label="자동 믹스 우선순위">
              <div className="automix-preset-row">
                <label>
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
                <button type="button" onPointerDown={() => applyAutoMixGenrePreset(autoMixGenrePreset)}>
                  추천 적용
                </button>
              </div>
              {autoMixReport.length > 0 ? (
                <div className="automix-result-list">
                  {autoMixReport.map((item) => {
                    const track = project.tracks.find((currentTrack) => currentTrack.id === item.trackId)
                    if (!track) return null

                    return (
                      <div className="automix-result" key={item.trackId}>
                        <span>{track.name} · {item.role}</span>
                        <strong>{Math.round(item.beforeVolume * 100)} → {Math.round(item.afterVolume * 100)}</strong>
                      </div>
                    )
                  })}
                </div>
              ) : null}
              <div className="automix-panel-head">
                <strong>믹스 컷</strong>
                <button type="button" onPointerDown={addAutoMixSection}>＋ 컷 추가 (C)</button>
              </div>
              {(project.autoMixSections ?? []).length === 0 ? (
                <p>컷을 추가하고 그 구간에서 가장 중요한 트랙만 고르면 자동 믹스가 나머지를 알아서 뒤로 보냅니다.</p>
              ) : (
                (project.autoMixSections ?? []).map((section) => (
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
                        <span>시작</span>
                        <input
                          min={1}
                          step={0.25}
                          type="number"
                          value={Number((section.startBeat / BEATS_PER_BAR + 1).toFixed(2))}
                          onChange={(event) => {
                            const nextStart = Math.max(0, (Number(event.target.value) - 1) * BEATS_PER_BAR)
                            updateAutoMixSection(section.id, { startBeat: nextStart })
                          }}
                        />
                      </label>
                      <label>
                        <span>끝</span>
                        <input
                          min={1.25}
                          step={0.25}
                          type="number"
                          value={Number((section.endBeat / BEATS_PER_BAR + 1).toFixed(2))}
                          onChange={(event) => {
                            const nextEnd = Math.max(0.25, (Number(event.target.value) - 1) * BEATS_PER_BAR)
                            updateAutoMixSection(section.id, { endBeat: nextEnd })
                          }}
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
                      <span>이 구간 중심 트랙</span>
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
                    <div className="automix-cut-preview" onPointerDown={() => focusAutoMixSection(section.id)}>
                      <span style={{ left: `${Math.min(100, Math.max(0, (section.startBeat / Math.max(1, totalBeats)) * 100))}%` }} />
                      <span style={{ left: `${Math.min(100, Math.max(0, (section.endBeat / Math.max(1, totalBeats)) * 100))}%` }} />
                    </div>
                  </article>
                ))
              )}
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  )
}
