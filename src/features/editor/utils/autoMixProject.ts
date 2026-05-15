import type { AutoMixGenre, AutoMixSettings, Project, Track } from '../../../types/music'

type TrackRole = 'audio' | 'bass' | 'drums' | 'lead' | 'pad'

type TrackAnalysis = {
  averagePitch: number
  density: number
  role: TrackRole
  track: Track
}

const PRIORITY_VOLUME: Record<number, number> = {
  1: 0.5,
  2: 0.6,
  3: 0.7,
  4: 0.8,
  5: 0.9,
}

const ROLE_VOLUME_OFFSET: Record<TrackRole, number> = {
  audio: 0,
  bass: 0.02,
  drums: 0.02,
  lead: 0.01,
  pad: -0.02,
}

export const AUTO_MIX_GENRES: Array<{ id: AutoMixGenre; label: string }> = [
  { id: 'balanced', label: '기본 균형' },
  { id: 'ballad', label: '발라드' },
  { id: 'rock', label: '락 밴드' },
  { id: 'hiphop', label: '힙합' },
  { id: 'edm', label: 'EDM' },
  { id: 'orchestra', label: '오케스트라' },
]

const GENRE_SETTING_PRESETS: Record<AutoMixGenre, Pick<AutoMixSettings, 'brightness' | 'reverb' | 'stereoWidth' | 'strength'>> = {
  balanced: { brightness: 0.5, reverb: 0.25, stereoWidth: 0.45, strength: 0.75 },
  ballad: { brightness: 0.48, reverb: 0.45, stereoWidth: 0.35, strength: 0.7 },
  rock: { brightness: 0.6, reverb: 0.22, stereoWidth: 0.55, strength: 0.8 },
  hiphop: { brightness: 0.52, reverb: 0.18, stereoWidth: 0.5, strength: 0.85 },
  edm: { brightness: 0.65, reverb: 0.3, stereoWidth: 0.75, strength: 0.85 },
  orchestra: { brightness: 0.55, reverb: 0.5, stereoWidth: 0.65, strength: 0.72 },
}

const GENRE_ROLE_PRIORITY: Record<AutoMixGenre, Record<TrackRole, number>> = {
  balanced: { audio: 3, bass: 4, drums: 4, lead: 5, pad: 2 },
  ballad: { audio: 3, bass: 3, drums: 2, lead: 5, pad: 4 },
  rock: { audio: 3, bass: 4, drums: 5, lead: 4, pad: 2 },
  hiphop: { audio: 3, bass: 5, drums: 5, lead: 4, pad: 2 },
  edm: { audio: 3, bass: 5, drums: 5, lead: 4, pad: 3 },
  orchestra: { audio: 3, bass: 3, drums: 2, lead: 4, pad: 5 },
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function getProgramNumber(instrumentId: string) {
  const match = instrumentId.match(/\d+/)
  return match ? Number(match[0]) : null
}

function getAveragePitch(project: Project, track: Track) {
  const notes = project.notesByTrack[track.id] ?? []
  if (notes.length === 0) return 60
  return notes.reduce((sum, note) => sum + note.pitch, 0) / notes.length
}

function classifyTrack(project: Project, track: Track): TrackRole {
  const name = track.name.toLowerCase()
  const instrumentId = track.instrumentId.toLowerCase()
  const program = getProgramNumber(track.instrumentId)
  const averagePitch = getAveragePitch(project, track)
  const hasAudioClips = (project.audioClips ?? []).some((clip) => clip.trackId === track.id)

  if (track.kind === 'audio' || instrumentId.includes('audio') || hasAudioClips) return 'audio'
  if (name.includes('drum') || name.includes('드럼') || instrumentId.includes('drum')) return 'drums'
  if (name.includes('bass') || name.includes('베이스') || (program !== null && program >= 32 && program <= 39) || averagePitch < 48) return 'bass'
  if (averagePitch >= 64) return 'lead'
  return 'pad'
}

function analyzeTrack(project: Project, track: Track): TrackAnalysis {
  const notes = project.notesByTrack[track.id] ?? []
  const clips = (project.audioClips ?? []).filter((clip) => clip.trackId === track.id)
  const noteDuration = notes.reduce((sum, note) => sum + note.durationBeats, 0)
  const clipDuration = clips.reduce((sum, clip) => sum + clip.durationBeats, 0)
  const density = noteDuration + clipDuration

  return {
    averagePitch: getAveragePitch(project, track),
    density,
    role: classifyTrack(project, track),
    track,
  }
}

function getTargetVolume(analysis: TrackAnalysis, maxDensity: number, priority: number) {
  const densityRatio = maxDensity > 0 ? analysis.density / maxDensity : 0
  const densityTrim = densityRatio > 0.7 ? -0.015 : densityRatio < 0.2 ? 0.015 : 0
  const safePriority = Math.round(clamp(priority, 1, 5))
  return clamp(PRIORITY_VOLUME[safePriority] + ROLE_VOLUME_OFFSET[analysis.role] + densityTrim, 0.35, 0.95)
}

export function getAutoMixRecommendedPriority(project: Project, track: Track, genre: AutoMixGenre) {
  return GENRE_ROLE_PRIORITY[genre][classifyTrack(project, track)]
}

export function getAutoMixGenrePreset(genre: AutoMixGenre) {
  return GENRE_SETTING_PRESETS[genre]
}

export const DEFAULT_AUTO_MIX_SETTINGS: AutoMixSettings = {
  strength: 0.75,
  reverb: 0.25,
  stereoWidth: 0.45,
  trackOrder: [],
  brightness: 0.5,
  recommendedGenre: 'balanced',
  trackPriorities: {},
}

export function getAutoMixSettings(project: Project): AutoMixSettings {
  return {
    ...DEFAULT_AUTO_MIX_SETTINGS,
    ...(project.autoMixSettings ?? {}),
    trackPriorities: project.autoMixSettings?.trackPriorities ?? {},
  }
}

function getTrackPriority(project: Project, settings: AutoMixSettings, analysis: TrackAnalysis) {
  const orderedIndex = settings.trackOrder?.indexOf(analysis.track.id) ?? -1
  if (orderedIndex >= 0) return Math.max(1, 5 - orderedIndex)
  return settings.trackPriorities[analysis.track.id] ?? getAutoMixRecommendedPriority(project, analysis.track, settings.recommendedGenre ?? 'balanced')
}

function getTargetPan(analysis: TrackAnalysis, sideIndex: number) {
  if (analysis.role === 'bass' || analysis.role === 'drums') return 0
  if (analysis.role === 'audio') return clamp(analysis.track.pan ?? 0, -0.25, 0.25)
  if (analysis.role === 'lead') return clamp((analysis.track.pan ?? 0) * 0.5, -0.18, 0.18)
  return sideIndex % 2 === 0 ? -0.32 : 0.32
}

export function autoMixProject(project: Project): Project {
  const analyses = project.tracks.map((track) => analyzeTrack(project, track))
  const activeAnalyses = analyses.filter((analysis) => !analysis.track.mute)
  const maxDensity = Math.max(0, ...activeAnalyses.map((analysis) => analysis.density))
  const targetVolumes = new Map<string, number>()
  let sideIndex = 0
  const settings = getAutoMixSettings(project)
  const strength = clamp(settings.strength, 0, 1)
  const targetReverb = clamp(settings.reverb, 0, 1)
  const brightnessBoost = (settings.brightness - 0.5) * 0.08

  activeAnalyses.forEach((analysis) => {
    const priority = getTrackPriority(project, settings, analysis)
    targetVolumes.set(analysis.track.id, getTargetVolume(analysis, maxDensity, priority) + brightnessBoost)
  })

  const estimatedOutput = Math.sqrt([...targetVolumes.values()].reduce((sum, volume) => sum + volume * volume, 0))
  const scale = estimatedOutput > 1.65 ? 1.65 / estimatedOutput : 1

  const mixedTracks = project.tracks.map((track) => {
    if (track.mute) return track

    const analysis = analyses.find((item) => item.track.id === track.id)
    if (!analysis) return track

    const pan = getTargetPan(analysis, sideIndex) * clamp(settings.stereoWidth * 1.5, 0, 1.25)
    if (analysis.role !== 'bass' && analysis.role !== 'drums') sideIndex += 1

    return {
      ...track,
      volume: Math.round(clamp((track.volume * (1 - strength)) + ((targetVolumes.get(track.id) ?? track.volume) * scale * strength), 0.25, 0.95) * 100) / 100,
      pan: Math.round(pan * 100) / 100,
    }
  })

  const mixedNotesByTrack = Object.fromEntries(
    Object.entries(project.notesByTrack).map(([trackId, notes]) => [
      trackId,
      notes.map((note) => ({
        ...note,
        reverb: Math.round(clamp(((note.reverb ?? 0) * (1 - strength)) + (targetReverb * strength), 0, 1) * 100) / 100,
      })),
    ]),
  )

  return {
    ...project,
    notesByTrack: mixedNotesByTrack,
    tracks: mixedTracks,
  }
}
