import type { Note } from '../../../types/music'
import type { TrackNote } from '../types'

export function toStoredNote(note: TrackNote): Note {
  const { trackId, ...storedNote } = note
  void trackId
  return storedNote
}