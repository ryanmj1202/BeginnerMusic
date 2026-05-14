import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import { isDrumInstrument } from '../../../lib/audio/toneTransport'
import type { Note, Track } from '../../../types/music'
import { NOTE_NAMES, TRACK_COLORS } from '../constants'
import type { OtherNote, TrackNote } from '../types'

type PianoRollRowsProps = {
  allTrackMelodyMode: boolean
  beginKeyPreview: (pitch: number, event: ReactPointerEvent<HTMLButtonElement>) => void
  beginMoveNote: (note: Note, event: ReactPointerEvent<HTMLButtonElement>) => void
  beginRightEraseNote: (note: Note, event: ReactPointerEvent<HTMLButtonElement>) => void
  beginRowAction: (pitch: number, event: ReactPointerEvent<HTMLDivElement>) => void
  beginRowContextErase: (pitch: number, event: ReactMouseEvent<HTMLDivElement>) => void
  continueKeyPreview: (pitch: number) => void
  draggingNoteId: string | null
  getNoteDisplayLabel: (note: Note) => string
  getRowLabel: (pitch: number) => string
  otherNotesByPitch: Map<number, OtherNote[]>
  playbackPressedPitchCounts: Map<number, number>
  pressedPitch: number | null
  projectSelectedNoteId: string | null
  resizingNoteId: string | null
  rollPitches: number[]
  selectedNoteIdSet: Set<string>
  selectedNoteIds: string[]
  selectedNotesByPitch: Map<number, TrackNote[]>
  selectedTrack: Track | undefined
  tracks: Track[]
  startResizingNote: (note: Note | TrackNote, event: ReactPointerEvent<HTMLSpanElement>) => void
  totalBeats: number
}

export function PianoRollRows({
  allTrackMelodyMode,
  beginKeyPreview,
  beginMoveNote,
  beginRightEraseNote,
  beginRowAction,
  beginRowContextErase,
  continueKeyPreview,
  draggingNoteId,
  getNoteDisplayLabel,
  getRowLabel,
  otherNotesByPitch,
  playbackPressedPitchCounts,
  pressedPitch,
  projectSelectedNoteId,
  resizingNoteId,
  rollPitches,
  selectedNoteIdSet,
  selectedNoteIds,
  selectedNotesByPitch,
  selectedTrack,
  tracks,
  startResizingNote,
  totalBeats,
}: PianoRollRowsProps) {
  const getTrackDisplay = (trackId: string) => {
    const track = tracks.find((item) => item.id === trackId)
    return {
      color: track?.color ?? TRACK_COLORS[0],
      opacity: track?.pianoRollOpacity ?? 1,
      visible: track?.pianoRollVisible ?? true,
    }
  }

  return (
    <>
      {rollPitches.map((pitch) => (
        <div className="roll-row" key={pitch}>
          <button
            type="button"
            className={`${selectedTrack && isDrumInstrument(selectedTrack.instrumentId) ? 'piano-key is-drum' : NOTE_NAMES[pitch % 12].includes('#') ? 'piano-key is-black' : 'piano-key'}${pressedPitch === pitch ? ' is-pressed' : ''
              }${playbackPressedPitchCounts.has(pitch) ? ' is-playback-pressed' : ''
              }`}
            data-pitch={pitch}
            onPointerDown={(event) => {
              beginKeyPreview(pitch, event)
            }}
            onPointerEnter={() => continueKeyPreview(pitch)}
          >
            {getRowLabel(pitch)}
          </button>
          <div
            className="step-row"
            onPointerDown={(event) => beginRowAction(pitch, event)}
            onContextMenu={(event) => beginRowContextErase(pitch, event)}
          >
            {(otherNotesByPitch.get(pitch) ?? []).map((note) => {
              const trackDisplay = getTrackDisplay(note.trackId)
              if (!trackDisplay.visible) return null

              const className = [
                'note-block',
                allTrackMelodyMode ? 'is-all-track-note' : 'is-ghost',
                selectedNoteIdSet.has(note.id) ? 'is-selected' : '',
                selectedNoteIdSet.has(note.id) && selectedNoteIds.length > 1 ? 'is-pattern-selected' : '',
              ]
                .filter(Boolean)
                .join(' ')

              if (!allTrackMelodyMode) {
                return (
                  <span
                    className={className}
                    key={`${note.trackId}-${note.id}`}
                    style={{
                      '--note-color': trackDisplay.color,
                      left: `${(note.startBeat / totalBeats) * 100}%`,
                      opacity: trackDisplay.opacity,
                      width: `${(note.durationBeats / totalBeats) * 100}%`,
                    } as CSSProperties}
                    aria-hidden="true"
                  />
                )
              }

              return (
                <button
                  type="button"
                  className={className}
                  key={`${note.trackId}-${note.id}`}
                  style={{
                    '--note-color': trackDisplay.color,
                    left: `${(note.startBeat / totalBeats) * 100}%`,
                    opacity: trackDisplay.opacity,
                    width: `${(note.durationBeats / totalBeats) * 100}%`,
                  } as CSSProperties}
                  onPointerDown={(event) => {
                    beginMoveNote(note, event)
                  }}
                />
              )
            })}

            {(selectedNotesByPitch.get(pitch) ?? []).map((note) => {
              const trackDisplay = getTrackDisplay(note.trackId)
              if (!trackDisplay.visible) return null

              const className = [
                'note-block',
                note.id === projectSelectedNoteId || selectedNoteIdSet.has(note.id) ? 'is-selected' : '',
                selectedNoteIdSet.has(note.id) && selectedNoteIds.length > 1 ? 'is-pattern-selected' : '',
                draggingNoteId === note.id ? 'is-dragging' : '',
                resizingNoteId === note.id ? 'is-resizing' : '',
              ]
                .filter(Boolean)
                .join(' ')

              return (
                <button
                  type="button"
                  className={className}
                  key={note.id}
                  style={{
                    '--note-color': trackDisplay.color,
                    left: `${(note.startBeat / totalBeats) * 100}%`,
                    opacity: trackDisplay.opacity,
                    width: `${(note.durationBeats / totalBeats) * 100}%`,
                  } as CSSProperties}
                  onPointerDown={(event) => {
                    beginMoveNote(note, event)
                  }}
                  onPointerDownCapture={(event) => {
                    beginRightEraseNote(note, event)
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault()
                  }}
                  aria-label={`${getNoteDisplayLabel(note)} 음표`}
                >
                  <span
                    className="resize-handle resize-handle-start"
                    data-edge="start"
                    onPointerDown={(event) => startResizingNote(note, event)}
                    aria-hidden="true"
                  />
                  <span className="note-label">{getNoteDisplayLabel(note)}</span>
                  <span
                    className="resize-handle"
                    data-edge="end"
                    onPointerDown={(event) => startResizingNote(note, event)}
                    aria-hidden="true"
                  />
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </>
  )
}
