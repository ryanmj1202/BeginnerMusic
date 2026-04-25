import { isDrumInstrument } from '../../lib/audio/toneTransport'
import type { InstrumentId, Note, PatternRepeatGroup, Project, Track } from '../../types/music'
import {
  BASE_HIGH_PITCH,
  BASE_LOW_PITCH,
  BEATS_PER_BAR,
  DEFAULT_BARS,
  DEFAULT_PROJECT_LENGTH_BEATS,
  FLOAT_EPSILON,
  INSTRUMENT_CATEGORY_LABELS,
  INSTRUMENT_OPTIONS,
  MIN_DURATION_BEATS,
  NOTE_NAMES,
  PATTERN_REPEAT_GAP_BEATS,
  PITCHES,
  PITCH_RANGE_MARGIN,
  ROLL_ZOOM_LEVELS,
  STORAGE_KEY,
  TEMPO_INPUT_MAX,
  TEMPO_INPUT_MIN,
  TRACK_COLORS,
} from './constants'

type TempoTimelineSegment = {
  startBeat: number
  endBeat: number
  tempo: number
}

const trackEndBeatCache = new WeakMap<Note[], number>()
type RollZoomLevel = (typeof ROLL_ZOOM_LEVELS)[number]

export function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

export function getPitchName(pitch: number) {
  const octave = Math.floor(pitch / 12) - 1
  return `${NOTE_NAMES[pitch % 12]}${octave}`
}

export function createInitialProject(): Project {
  const firstTrackId = createId('track')

  return {
    version: 1,
    id: createId('project'),
    title: '나의 첫 멜로디',
    tempo: 120,
    timeSignature: [4, 4],
    selectedTrackId: firstTrackId,
    selectedNoteId: null,
    lengthBeats: DEFAULT_PROJECT_LENGTH_BEATS,
    theme: 'dark',
    tracks: [
      {
        id: firstTrackId,
        name: '트랙 1',
        instrumentId: 'gm-0',
        volume: 0.85,
        pan: 0,
        mute: false,
        channel: 1,
        color: TRACK_COLORS[0],
      },
    ],
    notesByTrack: {
      [firstTrackId]: [],
    },
    audioClips: [],
    autoMixSections: [],
    tempoSections: [],
    patternPlacements: [],
    patternRepeatGroups: [],
  }
}

export function clampTempoValue(tempo: number | undefined, fallback: number) {
  const safeTempo = Number.isFinite(tempo) ? Number(tempo) : fallback
  return Math.max(TEMPO_INPUT_MIN, Math.min(TEMPO_INPUT_MAX, safeTempo))
}

export function normalizeProject(project: Project): Project {
  const fallbackTrackId = createId('track')
  const tracks: Track[] = project.tracks?.length
    ? project.tracks.map((track, index) => ({
      ...track,
      name: track.name?.startsWith('Track ') ? `트랙 ${index + 1}` : track.name,
      kind: track.kind ?? (track.instrumentId === 'audio-track' ? 'audio' as const : 'instrument' as const),
      pan: track.pan ?? 0,
      mute: track.mute ?? false,
      channel: track.channel ?? (isDrumInstrument(track.instrumentId) ? 10 : Math.min(16, index + 1)),
      color: track.color ?? TRACK_COLORS[index % TRACK_COLORS.length],
    }))
    : [
      {
        id: fallbackTrackId,
        name: '트랙 1',
        instrumentId: 'gm-0',
        kind: 'instrument',
        volume: 0.85,
        pan: 0,
        mute: false,
        channel: 1,
        color: TRACK_COLORS[0],
      },
    ]
  const selectedTrackId = tracks.some((track) => track.id === project.selectedTrackId)
    ? project.selectedTrackId
    : tracks[0].id

  return {
    ...project,
    version: 1,
    title: project.title || '나의 첫 멜로디',
    tempo: project.tempo || 120,
    timeSignature: project.timeSignature ?? [4, 4],
    selectedTrackId,
    selectedNoteId: project.selectedNoteId ?? null,
    lengthBeats: Math.max(DEFAULT_PROJECT_LENGTH_BEATS, project.lengthBeats ?? DEFAULT_PROJECT_LENGTH_BEATS),
    theme: 'dark',
    tracks,
    notesByTrack: {
      ...Object.fromEntries(tracks.map((track) => [track.id, []])),
      ...(project.notesByTrack ?? {}),
    },
    audioClips: (project.audioClips ?? []).filter((clip) =>
      tracks.some((track) => track.id === clip.trackId) && clip.dataUrl,
    ).map((clip) => ({
      ...clip,
      waveform: clip.waveform ?? [],
    })),
    patternPlacements: (project.patternPlacements ?? []).filter((placement) =>
      tracks.some((track) => track.id === placement.trackId),
    ).map((placement) => ({
      ...placement,
      spanBeats: Math.max(MIN_DURATION_BEATS, placement.spanBeats ?? DEFAULT_PROJECT_LENGTH_BEATS),
      startBeat: Math.max(0, placement.startBeat ?? 0),
    })),
    autoMixSections: (project.autoMixSections ?? []).map((section) => ({
      ...section,
      intensity: Math.min(1, Math.max(0, section.intensity ?? 0.7)),
      priorities: section.priorities ?? {},
      startBeat: Math.max(0, section.startBeat ?? 0),
      endBeat: Math.max(section.startBeat ?? 0, section.endBeat ?? DEFAULT_PROJECT_LENGTH_BEATS),
    })),
    tempoSections: (project.tempoSections ?? []).map((section) => ({
      ...section,
      startBeat: Math.max(0, section.startBeat ?? 0),
      endBeat: Math.max(section.startBeat ?? 0.25, section.endBeat ?? DEFAULT_PROJECT_LENGTH_BEATS),
      tempo: clampTempoValue(section.tempo, project.tempo || 120),
    })),
    patternRepeatGroups: (project.patternRepeatGroups ?? []).map((group) => ({
      ...group,
      baseEndBeat: Math.max(group.baseStartBeat ?? 0, group.baseEndBeat ?? DEFAULT_PROJECT_LENGTH_BEATS),
      baseNoteIds: group.baseNoteIds ?? [],
      baseStartBeat: Math.max(0, group.baseStartBeat ?? 0),
      gapBeats: Math.max(0, group.gapBeats ?? PATTERN_REPEAT_GAP_BEATS),
      repeats: (group.repeats ?? []).map((repeat) => ({ noteIds: repeat.noteIds ?? [] })),
    })).filter((group) => group.baseNoteIds.length > 0 && group.repeats.length > 0),
  }
}

export function readSavedProject() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? normalizeProject(JSON.parse(saved) as Project) : createInitialProject()
  } catch {
    return createInitialProject()
  }
}

export function getTrackEndBeat(notes: Note[]) {
  const cached = trackEndBeatCache.get(notes)
  if (cached !== undefined) return cached

  const endBeat = notes.reduce(
    (latestEnd, note) => Math.max(latestEnd, note.startBeat + note.durationBeats),
    0,
  )
  trackEndBeatCache.set(notes, endBeat)
  return endBeat
}

export function getNotesEndBeat(notesByTrack: Project['notesByTrack']) {
  return Object.values(notesByTrack)
    .reduce((endBeat, notes) => Math.max(endBeat, getTrackEndBeat(notes)), 0)
}

export function getPatternRepeatGroupNoteIds(group: PatternRepeatGroup) {
  return [
    ...group.baseNoteIds,
    ...group.repeats.flatMap((repeat) => repeat.noteIds),
  ]
}

export function prunePatternRepeatGroups(
  groups: PatternRepeatGroup[] | undefined,
  deletedNoteIds: Set<string>,
) {
  return (groups ?? [])
    .filter((group) => !getPatternRepeatGroupNoteIds(group).some((noteId) => deletedNoteIds.has(noteId)))
}

export function normalizePatternRepeatGapBeats(raw: number) {
  if (!Number.isFinite(raw)) return PATTERN_REPEAT_GAP_BEATS
  return Math.max(0, Math.min(16, Math.round(raw * 1000) / 1000))
}

export function getNormalizedTempoSections(project: Project, totalBeats: number) {
  return [...(project.tempoSections ?? [])]
    .map((section) => ({
      ...section,
      startBeat: Math.max(0, Math.min(totalBeats, section.startBeat ?? 0)),
      endBeat: Math.max(0.25, Math.min(totalBeats, section.endBeat ?? totalBeats)),
      tempo: clampTempoValue(section.tempo, project.tempo),
    }))
    .filter((section) => section.endBeat > section.startBeat)
    .sort((left, right) => left.startBeat - right.startBeat)
}

export function buildTempoTimeline(project: Project, totalBeats: number) {
  const safeTotalBeats = Math.max(1, totalBeats)
  const sections = getNormalizedTempoSections(project, safeTotalBeats)
  const segments: TempoTimelineSegment[] = []
  let cursor = 0

  sections.forEach((section) => {
    const startBeat = Math.max(cursor, section.startBeat)
    const endBeat = Math.max(startBeat + 0.25, Math.min(safeTotalBeats, section.endBeat))

    if (startBeat > cursor) {
      segments.push({
        startBeat: cursor,
        endBeat: startBeat,
        tempo: clampTempoValue(project.tempo, 120),
      })
    }

    segments.push({
      startBeat,
      endBeat,
      tempo: clampTempoValue(section.tempo, project.tempo),
    })
    cursor = endBeat
  })

  if (cursor < safeTotalBeats) {
    segments.push({
      startBeat: cursor,
      endBeat: safeTotalBeats,
      tempo: clampTempoValue(project.tempo, 120),
    })
  }

  if (segments.length === 0) {
    segments.push({
      startBeat: 0,
      endBeat: safeTotalBeats,
      tempo: clampTempoValue(project.tempo, 120),
    })
  }

  return segments
}

export function getTempoAtBeat(project: Project, beat: number, totalBeats: number) {
  const timeline = buildTempoTimeline(project, totalBeats)
  const matched = timeline.find((segment) => beat >= segment.startBeat && beat < segment.endBeat)
  return matched?.tempo ?? timeline[timeline.length - 1]?.tempo ?? clampTempoValue(project.tempo, 120)
}

export function getSecondsBetweenBeatsFromTimeline(
  timeline: TempoTimelineSegment[],
  startBeat: number,
  endBeat: number,
) {
  const safeStartBeat = Math.max(0, startBeat)
  const safeEndBeat = Math.max(safeStartBeat, endBeat)
  let seconds = 0

  timeline.forEach((segment) => {
    const overlapStart = Math.max(segment.startBeat, safeStartBeat)
    const overlapEnd = Math.min(segment.endBeat, safeEndBeat)
    if (overlapEnd <= overlapStart) return
    seconds += ((overlapEnd - overlapStart) * 60) / segment.tempo
  })

  return seconds
}

export function getSecondsAtBeatFromTimeline(timeline: TempoTimelineSegment[], beat: number) {
  return getSecondsBetweenBeatsFromTimeline(timeline, 0, beat)
}

export function getBeatAtSecondsFromTimeline(
  timeline: TempoTimelineSegment[],
  seconds: number,
  totalBeats: number,
) {
  const safeSeconds = Math.max(0, seconds)
  let elapsedSeconds = 0

  for (const segment of timeline) {
    const segmentSeconds = ((segment.endBeat - segment.startBeat) * 60) / segment.tempo
    if (safeSeconds <= elapsedSeconds + segmentSeconds) {
      return Math.min(
        totalBeats,
        segment.startBeat + ((safeSeconds - elapsedSeconds) * segment.tempo) / 60,
      )
    }
    elapsedSeconds += segmentSeconds
  }

  return totalBeats
}

export function nearlyEqual(left: number, right: number) {
  return Math.abs(left - right) < FLOAT_EPSILON
}

export function getGroupedPitchStep(notes: Array<Pick<Note, 'pitch'>>) {
  if (notes.length <= 1) return 1

  const sortedPitches = [...new Set(notes.map((note) => note.pitch))].sort((left, right) => left - right)
  if (sortedPitches.length <= 1) return 1

  const totalGap = sortedPitches.slice(1).reduce((sum, pitch, index) => {
    return sum + Math.abs(pitch - sortedPitches[index])
  }, 0)
  const averageGap = totalGap / (sortedPitches.length - 1)
  return Math.max(1, Math.min(12, Math.round(averageGap)))
}

export function hasUndoableProjectChange(current: Project, next: Project) {
  return (
    current.id !== next.id ||
    current.title !== next.title ||
    current.tempo !== next.tempo ||
    current.timeSignature[0] !== next.timeSignature[0] ||
    current.timeSignature[1] !== next.timeSignature[1] ||
    current.lengthBeats !== next.lengthBeats ||
    current.theme !== next.theme ||
    current.tracks !== next.tracks ||
    current.notesByTrack !== next.notesByTrack ||
    current.audioClips !== next.audioClips ||
    current.autoMixSections !== next.autoMixSections ||
    current.tempoSections !== next.tempoSections ||
    current.patternPlacements !== next.patternPlacements
  )
}

export function getVisibleBars(endBeat: number) {
  const neededBars = Math.max(DEFAULT_BARS, Math.ceil(endBeat / BEATS_PER_BAR))
  let visibleBars = DEFAULT_BARS

  while (visibleBars < neededBars) {
    visibleBars *= 2
  }

  return visibleBars
}

export function getInstrumentCategory(instrumentId: InstrumentId) {
  return INSTRUMENT_OPTIONS.find((instrument) => instrument.id === instrumentId)?.family ?? 'Piano'
}

export function getCategoryLabel(category: string) {
  return INSTRUMENT_CATEGORY_LABELS[category] ?? category
}

export function getNextZoom(currentZoom: RollZoomLevel, direction: -1 | 1): RollZoomLevel {
  const zoomLevels = ROLL_ZOOM_LEVELS
  const currentIndex = zoomLevels.indexOf(currentZoom)
  const nextIndex = Math.min(
    zoomLevels.length - 1,
    Math.max(0, currentIndex + direction),
  )

  return zoomLevels[nextIndex]
}

export function getDynamicPitches(notes: Note[]) {
  if (notes.length === 0) return PITCHES

  const minPitch = Math.max(0, Math.min(BASE_LOW_PITCH, Math.min(...notes.map((note) => note.pitch)) - PITCH_RANGE_MARGIN))
  const maxPitch = Math.min(127, Math.max(BASE_HIGH_PITCH, Math.max(...notes.map((note) => note.pitch)) + PITCH_RANGE_MARGIN))
  return Array.from({ length: maxPitch - minPitch + 1 }, (_, index) => maxPitch - index)
}

export type { TempoTimelineSegment }
