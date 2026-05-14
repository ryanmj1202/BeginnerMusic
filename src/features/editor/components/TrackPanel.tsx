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
  Project,
  Track,
} from '../../../types/music'
import {
  TRACK_COLORS,
} from '../constants'
import type {
  EditorTab,
} from '../types'

type TrackPanelProps = {
  addTrack: () => void
  applyAutoMix: () => void
  allTrackMelodyMode: boolean
  isRecordingVoice: boolean
  onClose: () => void
  openAudioUpload: () => void
  openInstrumentDialog: (track: Track) => void
  openTrackContextMenu: (trackId: string, event: ReactMouseEvent<HTMLElement>) => void
  openTrackPanelContextMenu: (event: ReactMouseEvent<HTMLElement>) => void
  project: Project
  selectTrack: (trackId: string) => void
  selectedTrackName: string
  setAllTrackMelodyMode: Dispatch<SetStateAction<boolean>>
  setActiveEditorTab: Dispatch<SetStateAction<EditorTab>>
  toggleVoiceRecording: () => Promise<void>
  totalBeats: number
  updateTrack: (trackId: string, updates: Partial<Track>) => void
}

export function TrackPanel({
  addTrack,
  applyAutoMix,
  allTrackMelodyMode,
  onClose,
  openInstrumentDialog,
  openTrackContextMenu,
  openTrackPanelContextMenu,
  project,
  selectTrack,
  selectedTrackName,
  setAllTrackMelodyMode,
  updateTrack,
}: TrackPanelProps) {
  function toggleTrackMute(trackId: string, mute: boolean) {
    updateTrack(trackId, { mute })
  }

  function toggleTrackSolo(trackId: string, solo: boolean) {
    updateTrack(trackId, { solo })
  }

  return (
    <aside className="track-panel" aria-label="악기 목록" onContextMenu={openTrackPanelContextMenu}>
      <div className="track-toolbar">
        <button type="button" className="back-button" aria-label="악기 목록 닫기" onPointerDown={onClose}>‹</button>
        <strong>{selectedTrackName}</strong>
      </div>

      <label className="track-mode-toggle">
        <input
          type="checkbox"
          checked={allTrackMelodyMode}
          onChange={(event) => setAllTrackMelodyMode(event.target.checked)}
        />
        <span>전체 악기 편집</span>
      </label>

      <div className="track-list" onContextMenu={openTrackPanelContextMenu}>
        {project.tracks.map((track, index) => (
          <article
            key={track.id}
            className={track.id === project.selectedTrackId ? 'track-item is-selected' : 'track-item'}
            onPointerDown={(event) => {
              if (event.button !== 0) return
              if (event.target instanceof Element && event.target.closest('button, input, label')) return
              selectTrack(track.id)
            }}
            onContextMenu={(event) => openTrackContextMenu(track.id, event)}
            style={{ '--track-color': track.color ?? TRACK_COLORS[0] } as CSSProperties}
          >
            <button
              type="button"
              className="instrument-image"
              aria-label={`${getInstrumentLabel(track.instrumentId)} 변경`}
              onPointerDown={(event) => {
                if (event.button !== 0) return
                event.preventDefault()
                event.stopPropagation()
                openInstrumentDialog(track)
              }}
            >
              <img alt="" draggable={false} src={getInstrumentImage(track.instrumentId)} />
            </button>

            <div className="track-copy">
              <strong>악기 {index + 1}</strong>
              <span>{getInstrumentLabel(track.instrumentId)}</span>
            </div>

            <label className="track-visibility-toggle" onPointerDownCapture={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
              <input
                type="checkbox"
                checked={track.pianoRollVisible ?? true}
                onChange={(event) => updateTrack(track.id, { pianoRollVisible: event.currentTarget.checked })}
              />
              <span>편집창 표시</span>
            </label>

            <label className="track-volume-control" onPointerDown={(event) => event.stopPropagation()}>
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

            <label className="track-volume-control" onPointerDown={(event) => event.stopPropagation()}>
              <span>좌우 균형</span>
              <input
                aria-label={`${track.name} 좌우 균형`}
                type="range"
                min="-1"
                max="1"
                step="0.01"
                value={track.pan ?? 0}
                onChange={(event) => updateTrack(track.id, { pan: Number(event.target.value) })}
              />
              <em>{Math.round((track.pan ?? 0) * 100)}</em>
            </label>

            <label className="track-volume-control" onPointerDown={(event) => event.stopPropagation()}>
              <span>투명도</span>
              <input
                aria-label={`${track.name} 편집창 투명도`}
                type="range"
                min="0.15"
                max="1"
                step="0.05"
                value={track.pianoRollOpacity ?? 1}
                onPointerDownCapture={(event) => event.stopPropagation()}
                onInput={(event) => updateTrack(track.id, { pianoRollOpacity: Number(event.currentTarget.value) })}
                onChange={(event) => updateTrack(track.id, { pianoRollOpacity: Number(event.target.value) })}
              />
              <em>{Math.round((track.pianoRollOpacity ?? 1) * 100)}</em>
            </label>

            <div className="track-quick-actions" onPointerDown={(event) => event.stopPropagation()}>
              <button
                type="button"
                className={track.solo ? 'track-action-button is-active' : 'track-action-button'}
                aria-pressed={track.solo}
                aria-label={`${track.name} 솔로 ${track.solo ? '끄기' : '켜기'}`}
                onPointerDown={(event) => {
                  if (event.button !== 0) return
                  event.preventDefault()
                  event.stopPropagation()
                  toggleTrackSolo(track.id, !track.solo)
                }}
              >
                독주
              </button>
              <button
                type="button"
                className={track.mute ? 'track-action-button is-active' : 'track-action-button'}
                aria-pressed={track.mute}
                aria-label={`${track.name} 음소거 ${track.mute ? '끄기' : '켜기'}`}
                onPointerDown={(event) => {
                  if (event.button !== 0) return
                  event.preventDefault()
                  event.stopPropagation()
                  toggleTrackMute(track.id, !track.mute)
                }}
              >
                음소거
              </button>
            </div>
          </article>
        ))}

        <button type="button" className="add-track-button" onPointerDown={addTrack}>＋ 악기 추가</button>
        <button type="button" className="add-track-button" onPointerDown={applyAutoMix}>자동 균형 조정</button>
      </div>
    </aside>
  )
}
