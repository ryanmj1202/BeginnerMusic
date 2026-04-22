import type { AudioClip, Note, PatternPlacement, Project } from '../../types/music'

const MIN_ARRANGEMENT_BEATS = 0.25

function cloneNote(note: Note, overrides: Partial<Note>): Note {
  return {
    ...note,
    ...overrides,
  }
}

function cloneClip(clip: AudioClip, overrides: Partial<AudioClip>): AudioClip {
  return {
    ...clip,
    ...overrides,
  }
}

export function getTrackSourceEndBeat(project: Project, trackId: string) {
  const noteEndBeat = (project.notesByTrack[trackId] ?? []).reduce(
    (latestEnd, note) => Math.max(latestEnd, note.startBeat + note.durationBeats),
    0,
  )
  const clipEndBeat = (project.audioClips ?? [])
    .filter((clip) => clip.trackId === trackId)
    .reduce((latestEnd, clip) => Math.max(latestEnd, clip.startBeat + clip.durationBeats), 0)

  return Math.max(MIN_ARRANGEMENT_BEATS, noteEndBeat, clipEndBeat)
}

export function getTrackPlacements(project: Project, trackId: string) {
  return (project.patternPlacements ?? [])
    .filter((placement) => placement.trackId === trackId)
    .sort((left, right) => left.startBeat - right.startBeat)
}

function expandNotesForPlacement(notes: Note[], placement: PatternPlacement) {
  return notes.flatMap((note) => {
    if (note.startBeat >= placement.spanBeats) return []

    const clippedDurationBeats = Math.min(
      note.durationBeats,
      Math.max(MIN_ARRANGEMENT_BEATS, placement.spanBeats - note.startBeat),
    )
    if (clippedDurationBeats <= 0) return []

    return [
      cloneNote(note, {
        id: `${placement.id}-${note.id}`,
        startBeat: placement.startBeat + note.startBeat,
        durationBeats: clippedDurationBeats,
      }),
    ]
  })
}

function expandClipsForPlacement(clips: AudioClip[], placement: PatternPlacement) {
  return clips.flatMap((clip) => {
    if (clip.startBeat >= placement.spanBeats) return []

    const clippedDurationBeats = Math.min(
      clip.durationBeats,
      Math.max(MIN_ARRANGEMENT_BEATS, placement.spanBeats - clip.startBeat),
    )
    if (clippedDurationBeats <= 0) return []

    return [
      cloneClip(clip, {
        id: `${placement.id}-${clip.id}`,
        startBeat: placement.startBeat + clip.startBeat,
        durationBeats: clippedDurationBeats,
      }),
    ]
  })
}

export function expandProjectForArrangement(project: Project): Project {
  const nextNotesByTrack: Record<string, Note[]> = {}
  const nextAudioClips: AudioClip[] = []

  project.tracks.forEach((track) => {
    const sourceNotes = project.notesByTrack[track.id] ?? []
    const sourceClips = (project.audioClips ?? []).filter((clip) => clip.trackId === track.id)
    const placements = getTrackPlacements(project, track.id)

    if (placements.length === 0) {
      nextNotesByTrack[track.id] = sourceNotes
      nextAudioClips.push(...sourceClips)
      return
    }

    nextNotesByTrack[track.id] = placements.flatMap((placement) => expandNotesForPlacement(sourceNotes, placement))
    nextAudioClips.push(...placements.flatMap((placement) => expandClipsForPlacement(sourceClips, placement)))
  })

  return {
    ...project,
    notesByTrack: nextNotesByTrack,
    audioClips: nextAudioClips,
  }
}
