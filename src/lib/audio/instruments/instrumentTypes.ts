export type BeginnerInstrument = {
  connect?: (node: unknown) => unknown
  disconnect?: () => unknown
  expectsMidi?: boolean
  readyTimeoutMs?: number
  ready?: Promise<void>
  supportsChordTrigger?: boolean
  setPitchBend?: (cents: number, time?: number, rampSeconds?: number) => unknown
  triggerAttackRelease: (
    note: number | number[],
    duration: number,
    time?: number,
    velocity?: number,
  ) => unknown
  triggerAttack: (note: number | number[], time?: number, velocity?: number) => unknown
  triggerRelease: (note?: number | number[], time?: number) => unknown
  dispose: () => unknown
}

export type HeldPreview = {
  instrument: BeginnerInstrument
  pitch: number
  startedAtMs: number
}

export type InstrumentMode = 'playback' | 'preview'
export type BasicOscillatorType = 'sine' | 'triangle' | 'sawtooth' | 'square'
export type BasicNoiseType = 'white' | 'pink' | 'brown'
