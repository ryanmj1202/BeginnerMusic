export type InstrumentId = string

export interface Note {
  id: string
  pitch: number
  startBeat: number
  durationBeats: number
  velocity: number
  pitchBend?: number
  volume?: number
  pan?: number
  expression?: number
  modulation?: number
}

export interface Track {
  id: string
  name: string
  instrumentId: InstrumentId
  kind?: 'instrument' | 'audio'
  volume: number
  pan?: number
  mute: boolean
  channel?: number
  color?: string
}

export interface AudioClip {
  id: string
  trackId: string
  name: string
  dataUrl: string
  startBeat: number
  durationBeats: number
  volume: number
  pan: number
  waveform?: number[]
}

export interface AutoMixSection {
  id: string
  name: string
  startBeat: number
  endBeat: number
  intensity: number
  priorities: Record<string, number>
}

export interface DrumPattern {
  id: string
  name: string
  lengthBeats: number
  notes: Note[]
}

export interface PatternPlacement {
  id: string
  trackId: string
  patternId: string
  startBeat: number
  spanBeats: number
}

export interface Project {
  version: 1
  id: string
  title: string
  tempo: number
  timeSignature: [number, number]
  selectedTrackId: string
  selectedNoteId: string | null
  lengthBeats?: number
  theme: 'light' | 'dark'
  tracks: Track[]
  notesByTrack: Record<string, Note[]>
  audioClips?: AudioClip[]
  autoMixSections?: AutoMixSection[]
}
