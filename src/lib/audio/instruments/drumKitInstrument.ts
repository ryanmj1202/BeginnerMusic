import * as Tone from 'tone'
import type { BasicNoiseType, BasicOscillatorType, BeginnerInstrument, InstrumentMode } from './instrumentTypes'

function getMidiFromNoteInput(note: number) {
  if (note >= 0 && note <= 127 && Number.isInteger(note)) return note
  return Math.round(Tone.Frequency(note).toMidi())
}

export function createDrumKitInstrument(mode: InstrumentMode): BeginnerInstrument {
  const activeVoices = new Set<{ dispose: () => unknown }>()
  const activeTimeouts = new Set<number>()
  const isPreview = mode === 'preview'
  let disposed = false

  function clearManagedTimeout(timeoutId: number) {
    window.clearTimeout(timeoutId)
    activeTimeouts.delete(timeoutId)
  }

  function disposeLater(voice: { dispose: () => unknown }, waitMs: number) {
    if (disposed) {
      voice.dispose()
      return
    }
    activeVoices.add(voice)
    const timeoutId = window.setTimeout(() => {
      activeTimeouts.delete(timeoutId)
      voice.dispose()
      activeVoices.delete(voice)
    }, waitMs)
    activeTimeouts.add(timeoutId)
  }

  function playNoise(
    duration: number,
    velocity: number,
    options: {
      attack: number
      decay: number
      release: number
      sustain: number
    },
    type: BasicNoiseType = 'white',
  ) {
    const voice = new Tone.NoiseSynth({
      noise: { type },
      envelope: options,
    }).toDestination()
    voice.triggerAttackRelease(duration, Tone.now(), velocity)
    disposeLater(voice, Math.max(120, duration * 1000 + 160))
  }

  function playMetal(
    duration: number,
    velocity: number,
    frequency: number,
    options: { harmonicity?: number; modulationIndex?: number; resonance?: number; octaves?: number } = {},
  ) {
    const voice = new Tone.MetalSynth({
      envelope: {
        attack: 0.001,
        decay: duration,
        release: 0.02,
      },
      harmonicity: options.harmonicity ?? 5.1,
      modulationIndex: options.modulationIndex ?? 18,
      resonance: options.resonance ?? 3600,
      octaves: options.octaves ?? 1.2,
    }).toDestination()
    voice.frequency.value = frequency
    voice.triggerAttackRelease(duration, Tone.now(), velocity)
    disposeLater(voice, Math.max(140, duration * 1000 + 180))
  }

  function playKick(midi: number, velocity: number) {
    const voice = new Tone.MembraneSynth({
      pitchDecay: midi === 35 ? 0.075 : 0.052,
      octaves: midi === 35 ? 10 : 8,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: midi === 35 ? 0.38 : 0.28, sustain: 0.002, release: 0.02 },
    }).toDestination()
    voice.triggerAttackRelease(midi === 35 ? 'G0' : 'B0', midi === 35 ? 0.25 : 0.19, Tone.now(), velocity)
    disposeLater(voice, 460)

    playNoise(0.028, velocity * 0.42, {
      attack: 0.001,
      decay: 0.025,
      sustain: 0,
      release: 0.006,
    }, 'brown')
    playToneClick(90, 0.018, velocity * 0.55, 'square')
  }

  function playSnare(midi: number, velocity: number) {
    if (midi === 37) {
      playToneClick(920, 0.045, velocity * 0.72, 'square')
      return
    }

    if (midi === 39) {
      playClap(velocity)
      return
    }

    playNoise(midi === 40 ? 0.2 : 0.15, velocity * 1.05, {
      attack: 0.001,
      decay: midi === 40 ? 0.18 : 0.14,
      sustain: 0.012,
      release: 0.025,
    }, midi === 40 ? 'pink' : 'white')

    const body = new Tone.MembraneSynth({
      pitchDecay: 0.014,
      octaves: 2,
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.001, decay: 0.08, sustain: 0.01, release: 0.02 },
    }).toDestination()
    body.triggerAttackRelease(midi === 40 ? 'D2' : 'C2', 0.075, Tone.now(), velocity * 0.42)
    disposeLater(body, 220)
    playToneClick(midi === 40 ? 2400 : 1800, 0.018, velocity * 0.38, 'square')
  }

  function playToneClick(
    frequency: number,
    duration: number,
    velocity: number,
    oscillator: BasicOscillatorType = 'triangle',
  ) {
    const voice = new Tone.Synth({
      oscillator: { type: oscillator },
      envelope: { attack: 0.001, decay: duration, sustain: 0, release: 0.01 },
    }).toDestination()
    voice.triggerAttackRelease(frequency, duration, Tone.now(), velocity)
    disposeLater(voice, Math.max(120, duration * 1000 + 120))
  }

  function playClap(velocity: number) {
    ;[0, 24, 48].forEach((delayMs) => {
      const timeoutId = window.setTimeout(() => {
        activeTimeouts.delete(timeoutId)
        activeVoices.delete(timeoutVoice)
        if (disposed) return
        playNoise(0.08, velocity * 0.42, {
          attack: 0.001,
          decay: 0.07,
          sustain: 0.02,
          release: 0.018,
        }, 'white')
      }, delayMs)
      activeTimeouts.add(timeoutId)
      const timeoutVoice = { dispose: () => clearManagedTimeout(timeoutId) }
      activeVoices.add(timeoutVoice)
    })
  }

  function playTom(midi: number, velocity: number) {
    const tomPitchByMidi: Record<number, string> = {
      41: 'F1',
      43: 'G1',
      45: 'A1',
      47: 'B1',
      48: 'C2',
      50: 'D2',
    }
    const voice = new Tone.MembraneSynth({
      pitchDecay: 0.03,
      octaves: 3.5,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.2, sustain: 0.035, release: 0.04 },
    }).toDestination()
    voice.triggerAttackRelease(tomPitchByMidi[midi] ?? 'A1', 0.18, Tone.now(), velocity * 0.9)
    disposeLater(voice, 360)
  }

  function playHat(midi: number, velocity: number) {
    const isOpen = midi === 46
    playNoise(isOpen ? 0.34 : 0.07, velocity * 0.7, {
      attack: 0.001,
      decay: isOpen ? 0.3 : 0.06,
      sustain: 0.006,
      release: isOpen ? 0.055 : 0.012,
    }, 'white')
    playMetal(isOpen ? 0.32 : 0.055, velocity * 0.52, isOpen ? 860 : 1280, {
      harmonicity: 9.2,
      modulationIndex: 30,
      resonance: isOpen ? 7200 : 8800,
      octaves: 0.42,
    })
  }

  function playCymbal(midi: number, velocity: number) {
    const ride = midi === 51 || midi === 53 || midi === 59
    playMetal(ride ? 0.72 : 0.64, velocity * 0.78, ride ? 520 : 370, {
      harmonicity: ride ? 5.4 : 7.2,
      modulationIndex: ride ? 18 : 34,
      resonance: ride ? 3800 : 6400,
      octaves: ride ? 1.3 : 0.85,
    })
    playNoise(ride ? 0.52 : 0.44, velocity * 0.38, {
      attack: 0.001,
      decay: ride ? 0.48 : 0.36,
      sustain: 0.015,
      release: 0.08,
    }, 'white')
  }

  function playTambourine(velocity: number) {
    playMetal(0.16, velocity * 0.45, 1180, {
      harmonicity: 8.5,
      modulationIndex: 34,
      resonance: 7200,
      octaves: 0.5,
    })
    playNoise(0.11, velocity * 0.35, { attack: 0.001, decay: 0.09, sustain: 0.01, release: 0.02 })
  }

  function playCowbell(velocity: number) {
    playToneClick(560, 0.12, velocity * 0.7, 'square')
    playToneClick(845, 0.09, velocity * 0.45, 'square')
  }

  function playVibraslap(velocity: number) {
    playToneClick(190, 0.04, velocity * 0.5, 'sawtooth')
    playNoise(0.32, velocity * 0.35, { attack: 0.002, decay: 0.28, sustain: 0.02, release: 0.06 }, 'brown')
  }

  function playHandDrum(midi: number, velocity: number) {
    const pitchByMidi: Record<number, string> = {
      60: 'G3',
      61: 'D3',
      62: 'A2',
      63: 'E2',
      64: 'C2',
      65: 'F3',
      66: 'C3',
    }
    const voice = new Tone.MembraneSynth({
      pitchDecay: 0.012,
      octaves: 1.8,
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.001, decay: midi >= 65 ? 0.16 : 0.22, sustain: 0.02, release: 0.025 },
    }).toDestination()
    voice.triggerAttackRelease(pitchByMidi[midi] ?? 'C3', 0.13, Tone.now(), velocity * 0.78)
    disposeLater(voice, 280)
  }

  function playAgogo(midi: number, velocity: number) {
    playToneClick(midi === 67 ? 880 : 620, 0.16, velocity * 0.72, 'square')
  }

  function playShaker(midi: number, velocity: number) {
    const duration = midi === 70 ? 0.08 : 0.12
    playNoise(duration, velocity * 0.42, {
      attack: 0.001,
      decay: duration,
      sustain: 0.01,
      release: 0.02,
    }, midi === 69 ? 'pink' : 'white')
  }

  function playWhistle(midi: number, velocity: number) {
    playToneClick(midi === 71 ? 1760 : 1320, midi === 71 ? 0.12 : 0.34, velocity * 0.55, 'sine')
  }

  function playScraper(midi: number, velocity: number) {
    const duration = midi === 73 ? 0.14 : 0.34
    playNoise(duration, velocity * 0.35, {
      attack: 0.002,
      decay: duration,
      sustain: 0.04,
      release: 0.04,
    }, 'brown')
    playToneClick(midi === 73 ? 520 : 410, 0.035, velocity * 0.28, 'square')
  }

  function playWood(midi: number, velocity: number) {
    const frequency = midi === 75 ? 1120 : midi === 76 ? 940 : 640
    playToneClick(frequency, 0.055, velocity * 0.72, 'triangle')
  }

  function playCuica(midi: number, velocity: number) {
    const voice = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: midi === 78 ? 0.08 : 0.18, sustain: 0, release: 0.025 },
    }).toDestination()
    const now = Tone.now()
    voice.frequency.setValueAtTime(midi === 78 ? 760 : 520, now)
    voice.frequency.exponentialRampToValueAtTime(midi === 78 ? 360 : 980, now + (midi === 78 ? 0.07 : 0.16))
    voice.triggerAttackRelease(midi === 78 ? 760 : 520, midi === 78 ? 0.08 : 0.18, now, velocity * 0.58)
    disposeLater(voice, 260)
  }

  function playTriangle(midi: number, velocity: number) {
    playMetal(midi === 80 ? 0.18 : 0.58, velocity * 0.48, 1450, {
      harmonicity: 9.2,
      modulationIndex: 9,
      resonance: 8200,
      octaves: 0.35,
    })
  }

  function playDrumHit(note: number, velocity = 0.75) {
    if (disposed) return
    const midi = getMidiFromNoteInput(note)
    const level = isPreview ? Math.min(0.75, velocity) : velocity

    if (midi === 35 || midi === 36) {
      playKick(midi, level)
      return
    }

    if (midi === 38 || midi === 40 || midi === 37 || midi === 39) {
      playSnare(midi, level)
      return
    }

    if (midi === 42 || midi === 44 || midi === 46) {
      playHat(midi, level)
      return
    }

    if ([41, 43, 45, 47, 48, 50].includes(midi)) {
      playTom(midi, level)
      return
    }

    if (midi === 54) {
      playTambourine(level)
      return
    }

    if (midi === 56) {
      playCowbell(level)
      return
    }

    if (midi === 58) {
      playVibraslap(level)
      return
    }

    if (midi >= 49 && midi <= 59) {
      playCymbal(midi, level)
      return
    }

    if (midi >= 60 && midi <= 66) {
      playHandDrum(midi, level)
      return
    }

    if (midi === 67 || midi === 68) {
      playAgogo(midi, level)
      return
    }

    if (midi === 69 || midi === 70) {
      playShaker(midi, level)
      return
    }

    if (midi === 71 || midi === 72) {
      playWhistle(midi, level)
      return
    }

    if (midi === 73 || midi === 74) {
      playScraper(midi, level)
      return
    }

    if (midi === 75 || midi === 76 || midi === 77) {
      playWood(midi, level)
      return
    }

    if (midi === 78 || midi === 79) {
      playCuica(midi, level)
      return
    }

    if (midi === 80 || midi === 81) {
      playTriangle(midi, level)
      return
    }

    playNoise(0.08, level * 0.7, { attack: 0.001, decay: 0.08, sustain: 0.01, release: 0.025 }, 'white')
  }

  return {
    expectsMidi: true,
    triggerAttackRelease(note, _duration, _time, velocity) {
      if (disposed) return
      playDrumHit(note, velocity)
    },
    triggerAttack(note, _time, velocity) {
      if (disposed) return
      playDrumHit(note, velocity)
    },
    triggerRelease() {},
    dispose() {
      if (disposed) return
      disposed = true
      activeTimeouts.forEach((timeoutId) => window.clearTimeout(timeoutId))
      activeTimeouts.clear()
      activeVoices.forEach((voice) => voice.dispose())
      activeVoices.clear()
    },
  }
}

