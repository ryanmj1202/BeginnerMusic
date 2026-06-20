import { getWorkstationLoopSettings } from '../../../lib/workstationLoop'
import type { Note, Project, Track } from '../../../types/music'

export function getPlaybackLoopState(project: Project, playbackTotalBeats: number) {
  const settings = getWorkstationLoopSettings(project)
  const lengthBeats = Math.max(1, Math.min(Math.max(1, playbackTotalBeats), settings.lengthBeats))

  return {
    enabled: settings.enabled,
    lengthBeats,
  }
}

export function getPreparedPlaybackNotes(project: Project, track: Track, loopLengthBeats?: number) {
  return (project.notesByTrack[track.id] ?? [])
    .filter((note) => loopLengthBeats === undefined || (
      note.startBeat < loopLengthBeats &&
      note.startBeat + note.durationBeats > 0
    ))
    .map((note) => {
      const startBeat = loopLengthBeats === undefined
        ? note.startBeat
        : Math.max(0, note.startBeat)
      const durationBeats = loopLengthBeats === undefined
        ? note.durationBeats
        : Math.min(note.durationBeats, Math.max(0, loopLengthBeats - startBeat))

      return {
        ...note,
        durationBeats,
        startBeat,
        velocity: note.velocity * track.volume,
      }
    })
    .filter((note) => note.durationBeats > 0)
    .sort((left, right) => left.startBeat - right.startBeat)
}

export function getFirstNoteIndexAtBeat(notes: Note[], beat: number) {
  let low = 0
  let high = notes.length

  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (notes[mid].startBeat < beat) {
      low = mid + 1
    } else {
      high = mid
    }
  }

  return low
}

export function getPlaybackContentEndBeat(project: Project) {
  const hasSoloTrack = project.tracks.some((item) => item.solo)
  const activeTrackIds = new Set(
    project.tracks
      .filter((track) => !track.mute && (!hasSoloTrack || track.solo))
      .map((track) => track.id),
  )

  let notesEndBeat = 0
  Object.entries(project.notesByTrack).forEach(([trackId, notes]) => {
    if (!activeTrackIds.has(trackId)) return

    notes.forEach((note) => {
      notesEndBeat = Math.max(notesEndBeat, note.startBeat + note.durationBeats)
    })
  })

  const clipsEndBeat = (project.audioClips ?? []).reduce((latestEnd, clip) => {
    if (!activeTrackIds.has(clip.trackId)) return latestEnd
    return Math.max(latestEnd, clip.startBeat + clip.durationBeats)
  }, 0)

  return Math.max(notesEndBeat, clipsEndBeat)
}
