import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from 'react'
import type { AudioClip, Track } from '../../../types/music'

const DEFAULT_WAVEFORM = Array.from({ length: 48 }, () => 0.25)

type AudioRollViewProps = {
  adjustAudioClipVolumeFromPointer: (clip: AudioClip, event: ReactPointerEvent<HTMLElement>) => void
  pianoRollRef: RefObject<HTMLDivElement | null>
  rollShellStyle: CSSProperties
  rollTimelineStyle: CSSProperties
  seekPlaybackFromTimeline: (event: ReactPointerEvent<HTMLDivElement>) => void
  selectedAudioClips: AudioClip[]
  selectedTrack: Track | undefined
  totalBeats: number
  visibleBars: number
}

export function AudioRollView({
  adjustAudioClipVolumeFromPointer,
  pianoRollRef,
  rollShellStyle,
  rollTimelineStyle,
  seekPlaybackFromTimeline,
  selectedAudioClips,
  selectedTrack,
  totalBeats,
  visibleBars,
}: AudioRollViewProps) {
  return (
    <div
      className="piano-roll audio-roll"
      ref={pianoRollRef}
      style={rollShellStyle}
    >
      <div className="corner-cell">소리</div>
      <div
        className="measure-row"
        style={rollTimelineStyle}
        onPointerDown={seekPlaybackFromTimeline}
      >
        <span className="timeline-seek-fill" aria-hidden="true" />
        <span className="timeline-seek-handle" aria-hidden="true" />
        {Array.from({ length: visibleBars }, (_, bar) => (
          <div className="measure-cell" key={bar}>
            {bar + 1}
          </div>
        ))}
      </div>
      <div className="audio-roll-label">
        <strong>{selectedTrack?.name ?? '소리 파일'}</strong>
        <span>클립을 위아래로 움직이면 음량이 바뀝니다.</span>
      </div>
      <div className="audio-roll-grid">
        <div className="audio-roll-lane">
          {selectedAudioClips.length > 0 ? selectedAudioClips.map((clip) => {
            const waveform = clip.waveform?.length ? clip.waveform.slice(0, 48) : DEFAULT_WAVEFORM

            return (
              <button
                type="button"
                className="audio-roll-clip"
                key={clip.id}                style={{
                  left: `${(clip.startBeat / totalBeats) * 100}%`,
                  width: `${Math.max(4, (clip.durationBeats / totalBeats) * 100)}%`,
                }}
                onPointerDown={(event) => adjustAudioClipVolumeFromPointer(clip, event)}
              >
                <span className="audio-roll-waveform" aria-hidden="true">
                  {waveform.map((peak, index) => (
                    <i
                      key={index}
                      style={{ height: `${Math.max(12, Math.min(100, peak * clip.volume * 100))}%` }}
                    />
                  ))}
                </span>
                <span className="audio-roll-meta">
                  <strong>{clip.name}</strong>
                  <em>음량 {Math.round(clip.volume * 100)}</em>
                </span>
              </button>
            )
          }) : (
            <div className="audio-track-empty">
              <strong>소리 파일이 없습니다.</strong>
              <span>소리 넣기나 녹음을 누르면 여기에 추가됩니다.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}