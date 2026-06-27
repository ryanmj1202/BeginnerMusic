import * as Tone from 'tone'
import { getProgramFromInstrumentId } from '../../midi/generalMidi'
import type { InstrumentId } from '../../../types/music'
import type { BeginnerInstrument, InstrumentMode } from './instrumentTypes'
import { getVariant, isDrumInstrument, pickOscillator } from './instrumentRegistry'

function wrapPolySynthInstrument(synth: Tone.PolySynth): BeginnerInstrument {
  let disposed = false
  let pitchBendCents = 0
  const pitchBendTimeouts = new Set<number>()
  const destination = Tone.getDestination()
  let outputNode: unknown = destination
  synth.connect(destination)

  function applyPitchBend(cents: number) {
    pitchBendCents = cents
    synth.set({ detune: cents })
  }

  return {
    connect(node) {
      if (outputNode === node) return node
      synth.disconnect()
      const target = node as any
      synth.connect(target)
      outputNode = target
      return node
    },
    disconnect() {
      if (outputNode === destination) return destination
      synth.disconnect()
      synth.connect(destination)
      outputNode = destination
      return destination
    },
    setPitchBend(cents, time, rampSeconds = 0) {
      const startDelayMs = Math.max(0, ((time ?? Tone.now()) - Tone.now()) * 1000)
      if (rampSeconds <= 0) {
        const timeoutId = window.setTimeout(() => {
          pitchBendTimeouts.delete(timeoutId)
          if (!disposed) applyPitchBend(cents)
        }, startDelayMs)
        pitchBendTimeouts.add(timeoutId)
        return
      }

      const startCents = pitchBendCents
      const steps = Math.max(8, Math.min(48, Math.round(rampSeconds * 60)))
      for (let index = 1; index <= steps; index += 1) {
        const ratio = index / steps
        const timeoutId = window.setTimeout(() => {
          pitchBendTimeouts.delete(timeoutId)
          if (!disposed) applyPitchBend(startCents + (cents - startCents) * ratio)
        }, startDelayMs + rampSeconds * 1000 * ratio)
        pitchBendTimeouts.add(timeoutId)
      }
    },
    triggerAttackRelease(note, duration, time, velocity) {
      if (disposed) return
      return synth.triggerAttackRelease(note, duration, time, velocity)
    },
    triggerAttack(note, time, velocity) {
      if (disposed) return
      return synth.triggerAttack(note, time, velocity)
    },
    triggerRelease(note, time) {
      if (disposed) return
      if (note === undefined) {
        return synth.releaseAll(time)
      }
      return synth.triggerRelease(note, time)
    },
    dispose() {
      if (disposed) return
      disposed = true
      pitchBendTimeouts.forEach((timeoutId) => window.clearTimeout(timeoutId))
      pitchBendTimeouts.clear()
      const now = Tone.now()
      synth.releaseAll(now)
      synth.volume.cancelScheduledValues(now)
      synth.volume.setValueAtTime(-96, now)
      synth.dispose()
    },
    supportsChordTrigger: true,
  }
}

export function createSynthInstrument(
  instrumentId: InstrumentId,
  mode: InstrumentMode = 'playback',
): BeginnerInstrument {
  const program = getProgramFromInstrumentId(instrumentId)
  const isPreview = mode === 'preview'
  const release = (playbackRelease: number, previewRelease = 0.05) =>
    isPreview ? previewRelease : playbackRelease
  const variant = program === null ? 0 : getVariant(program)
  const createWrappedPolySynth = (options: ConstructorParameters<typeof Tone.PolySynth>[0]) =>
    wrapPolySynthInstrument(new Tone.PolySynth(options))

  if (isDrumInstrument(instrumentId)) {
    return createWrappedPolySynth({
      voice: Tone.MembraneSynth,
      maxPolyphony: isPreview ? 2 : 24,
      options: {
        pitchDecay: 0.018 + variant * 0.004,
        octaves: 3 + variant,
        oscillator: { type: pickOscillator(variant, 1) },
        envelope: {
          attack: 0.001,
          decay: 0.09 + variant * 0.025,
          sustain: variant % 3 === 0 ? 0.01 : 0.04,
          release: release(0.08 + variant * 0.025, 0.025),
        },
      },
    })
  }

  if (program !== null && program < 8) {
    return createWrappedPolySynth({
      voice: Tone.FMSynth,
      maxPolyphony: isPreview ? 2 : 24,
      options: {
        harmonicity: 2.2 + variant * 0.27,
        modulationIndex: 6 + variant * 2.4,
        envelope: {
          attack: 0.001 + variant * 0.001,
          decay: 0.16 + variant * 0.055,
          sustain: 0.1 + (variant % 4) * 0.08,
          release: release(0.35 + variant * 0.08),
        },
        modulationEnvelope: {
          attack: 0.001,
          decay: 0.1 + variant * 0.04,
          sustain: 0.03 + (variant % 3) * 0.04,
          release: release(0.18 + variant * 0.035),
        },
      },
    })
  }

  if (program !== null && program >= 8 && program < 16) {
    return createWrappedPolySynth({
      voice: Tone.FMSynth,
      maxPolyphony: isPreview ? 2 : 20,
      options: {
        harmonicity: 3 + variant * 0.6,
        modulationIndex: 10 + variant * 3,
        envelope: {
          attack: 0.001,
          decay: 0.18 + variant * 0.075,
          sustain: 0.03 + (variant % 4) * 0.04,
          release: release(0.22 + variant * 0.04),
        },
        modulationEnvelope: {
          attack: 0.001,
          decay: 0.12 + variant * 0.035,
          sustain: 0.02 + (variant % 2) * 0.06,
          release: release(0.12 + variant * 0.03),
        },
      },
    })
  }

  if (program !== null && program >= 16 && program < 24) {
    return createWrappedPolySynth({
      voice: Tone.AMSynth,
      maxPolyphony: isPreview ? 2 : 24,
      options: {
        harmonicity: 0.75 + variant * 0.2,
        oscillator: { type: pickOscillator(variant, 2) },
        envelope: {
          attack: 0.004 + variant * 0.003,
          decay: 0.03 + variant * 0.02,
          sustain: 0.58 + (variant % 4) * 0.1,
          release: release(0.12 + variant * 0.05),
        },
        modulation: { type: pickOscillator(variant, 1) },
        modulationEnvelope: {
          attack: 0.006,
          decay: 0.04 + variant * 0.025,
          sustain: 0.45 + (variant % 3) * 0.14,
          release: release(0.1 + variant * 0.03),
        },
      },
    })
  }

  if (program !== null && program >= 24 && program < 32) {
    return createWrappedPolySynth({
      voice: Tone.Synth,
      maxPolyphony: isPreview ? 2 : 18,
      options: {
        oscillator: { type: pickOscillator(variant, program >= 29 ? 3 : 0) },
        envelope: {
          attack: 0.002 + variant * 0.001,
          decay: 0.08 + variant * 0.035,
          sustain: 0.08 + (variant % 5) * 0.07,
          release: release(0.12 + variant * 0.05),
        },
      },
    })
  }

  if (instrumentId === 'bass' || (program !== null && program >= 32 && program <= 39)) {
    return createWrappedPolySynth({
      voice: Tone.Synth,
      maxPolyphony: isPreview ? 2 : 18,
      options: {
        oscillator: { type: pickOscillator(variant, program !== null && program >= 38 ? 2 : 0) },
        envelope: {
          attack: 0.004 + variant * 0.002,
          decay: 0.05 + variant * 0.025,
          sustain: 0.35 + (variant % 5) * 0.11,
          release: release(0.18 + variant * 0.06, 0.04),
        },
      },
    })
  }

  if (program !== null && program >= 40 && program < 56) {
    return createWrappedPolySynth({
      voice: Tone.Synth,
      maxPolyphony: isPreview ? 2 : 24,
      options: {
        oscillator: { type: pickOscillator(variant, 3) },
        envelope: {
          attack: 0.025 + variant * 0.018,
          decay: 0.08 + variant * 0.03,
          sustain: 0.42 + (variant % 4) * 0.12,
          release: release(0.45 + variant * 0.12),
        },
      },
    })
  }

  if (instrumentId === 'brass' || (program !== null && program >= 56 && program <= 63)) {
    return createWrappedPolySynth({
      voice: Tone.Synth,
      maxPolyphony: isPreview ? 2 : 24,
      options: {
        oscillator: { type: pickOscillator(variant, 3) },
        envelope: {
          attack: 0.012 + variant * 0.009,
          decay: 0.08 + variant * 0.035,
          sustain: 0.45 + (variant % 4) * 0.12,
          release: release(0.22 + variant * 0.07),
        },
      },
    })
  }

  if (program !== null && program >= 64 && program < 80) {
    return createWrappedPolySynth({
      voice: Tone.Synth,
      maxPolyphony: isPreview ? 2 : 20,
      options: {
        oscillator: { type: pickOscillator(variant, 1) },
        envelope: {
          attack: 0.01 + variant * 0.008,
          decay: 0.09 + variant * 0.04,
          sustain: 0.28 + (variant % 5) * 0.11,
          release: release(0.25 + variant * 0.08),
        },
      },
    })
  }

  if (
    instrumentId === 'synth' ||
    (program !== null && ((program >= 80 && program <= 103) || program >= 120))
  ) {
    return createWrappedPolySynth({
      voice: Tone.Synth,
      maxPolyphony: isPreview ? 2 : 24,
      options: {
        oscillator: { type: pickOscillator(variant, program !== null && program >= 96 ? 1 : 2) },
        envelope: {
          attack: 0.002 + variant * 0.01,
          decay: 0.08 + variant * 0.04,
          sustain: 0.22 + (variant % 6) * 0.1,
          release: release(0.22 + variant * 0.1),
        },
      },
    })
  }

  if (program !== null && program >= 104 && program < 112) {
    return createWrappedPolySynth({
      voice: Tone.Synth,
      maxPolyphony: isPreview ? 2 : 16,
      options: {
        oscillator: { type: pickOscillator(variant) },
        envelope: {
          attack: 0.004 + variant * 0.003,
          decay: 0.12 + variant * 0.05,
          sustain: 0.16 + (variant % 5) * 0.08,
          release: release(0.32 + variant * 0.09),
        },
      },
    })
  }

  if (program !== null && program >= 112 && program < 120) {
    return createWrappedPolySynth({
      voice: Tone.FMSynth,
      maxPolyphony: isPreview ? 2 : 18,
      options: {
        harmonicity: 4 + variant * 0.35,
        modulationIndex: 10 + variant * 2,
        envelope: {
          attack: 0.001,
          decay: 0.12 + variant * 0.04,
          sustain: 0.02 + (variant % 3) * 0.06,
          release: release(0.18 + variant * 0.05),
        },
        modulationEnvelope: {
          attack: 0.001,
          decay: 0.1 + variant * 0.03,
          sustain: 0.01 + (variant % 2) * 0.04,
          release: release(0.12 + variant * 0.03),
        },
      },
    })
  }

  return createWrappedPolySynth({
    voice: Tone.Synth,
    maxPolyphony: isPreview ? 2 : 24,
    options: {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.004, decay: 0.14, sustain: 0.24, release: release(0.85) },
    },
  })
}
