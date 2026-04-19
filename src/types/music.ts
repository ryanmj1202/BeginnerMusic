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
  volume: number
  mute: boolean
  channel?: number
  color?: string
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
}
