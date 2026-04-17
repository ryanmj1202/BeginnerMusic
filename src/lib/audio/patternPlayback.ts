import type { DrumPattern, Note, PatternPlacement } from '../../types/music'

export function expandPatternPlacement(
  pattern: DrumPattern,
  placement: PatternPlacement,
): Note[] {
  const repeatCount = Math.max(1, Math.ceil(placement.spanBeats / pattern.lengthBeats))

  return Array.from({ length: repeatCount }, (_, repeatIndex) => {
    const offset = repeatIndex * pattern.lengthBeats

    return pattern.notes
      .map((note) => ({
        ...note,
        id: `${placement.id}-${repeatIndex}-${note.id}`,
        startBeat: placement.startBeat + offset + note.startBeat,
      }))
      .filter((note) => note.startBeat < placement.startBeat + placement.spanBeats)
  }).flat()
}
