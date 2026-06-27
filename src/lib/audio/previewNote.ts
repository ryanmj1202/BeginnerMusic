import * as Tone from 'tone'
import type { InstrumentId } from '../../types/music'
import { ensureAudioReady } from './audioCore'
import { createInstrument } from './instruments/createInstrument'
import { waitForInstrumentReady } from './instruments/instrumentReadiness'
import { MIN_PREVIEW_MS } from './instruments/instrumentRegistry'
import type { BeginnerInstrument, HeldPreview } from './instruments/instrumentTypes'

let activeOneShotPreview: { instrument: BeginnerInstrument; timeoutId: number } | null = null
let oneShotPreviewToken = 0

export async function startPreviewNote(
  instrumentId: InstrumentId,
  pitch: number,
  velocity = 0.75,
): Promise<HeldPreview> {
  await ensureAudioReady()
  const instrument = createInstrument(instrumentId, 'preview')
  await waitForInstrumentReady(instrument)
  const noteInput = instrument.expectsMidi ? pitch : Tone.Frequency(pitch, 'midi').toFrequency()
  instrument.triggerAttack(noteInput, Tone.now(), velocity)
  return { instrument, pitch, startedAtMs: performance.now() }
}

export function stopPreviewNote(preview: HeldPreview | null) {
  if (!preview) return
  const remainingMs = Math.max(0, MIN_PREVIEW_MS - (performance.now() - preview.startedAtMs))

  window.setTimeout(() => {
    const noteInput = preview.instrument.expectsMidi
      ? preview.pitch
      : Tone.Frequency(preview.pitch, 'midi').toFrequency()
    preview.instrument.triggerRelease(noteInput, Tone.now())
    window.setTimeout(() => preview.instrument.dispose(), 120)
  }, remainingMs)
}

export function stopPreviewNoteImmediately(preview: HeldPreview | null) {
  if (!preview) return
  preview.instrument.triggerRelease(undefined, Tone.now())
  preview.instrument.dispose()
}

export function disposePreviewNote(preview: HeldPreview | null) {
  if (!preview) return
  const remainingMs = Math.max(0, MIN_PREVIEW_MS - (performance.now() - preview.startedAtMs))
  window.setTimeout(() => preview.instrument.dispose(), remainingMs)
}

export function stopAllPreviewAudio() {
  oneShotPreviewToken += 1
  if (activeOneShotPreview) {
    window.clearTimeout(activeOneShotPreview.timeoutId)
    activeOneShotPreview.instrument.triggerRelease(undefined, Tone.now())
    activeOneShotPreview.instrument.dispose()
    activeOneShotPreview = null
  }
}

export function changePreviewNote(
  preview: HeldPreview | null,
  pitch: number,
  velocity = 0.75,
) {
  if (!preview || preview.pitch === pitch) return

  const now = Tone.now()
  preview.instrument.triggerRelease(undefined, now)
  preview.pitch = pitch
  preview.startedAtMs = performance.now()
  const noteInput = preview.instrument.expectsMidi ? pitch : Tone.Frequency(pitch, 'midi').toFrequency()
  preview.instrument.triggerAttack(noteInput, now + 0.015, velocity)
}

export async function previewNote(
  instrumentId: InstrumentId,
  pitch: number,
  velocity = 0.75,
  durationSeconds = 0.28,
  pan = 0,
) {
  const previewToken = ++oneShotPreviewToken
  await ensureAudioReady()
  if (previewToken !== oneShotPreviewToken) return

  if (activeOneShotPreview) {
    window.clearTimeout(activeOneShotPreview.timeoutId)
    activeOneShotPreview.instrument.triggerRelease(undefined, Tone.now())
    activeOneShotPreview.instrument.dispose()
    activeOneShotPreview = null
  }

  const instrument = createInstrument(instrumentId, 'preview')
  await waitForInstrumentReady(instrument)
  if (previewToken !== oneShotPreviewToken) {
    instrument.dispose()
    return
  }

  const noteInput = instrument.expectsMidi ? pitch : Tone.Frequency(pitch, 'midi').toFrequency()
  if (Math.abs(pan) > 0.01) {
    const panner = new Tone.Panner(Math.max(-1, Math.min(1, pan))).toDestination()
    instrument.disconnect?.()
    instrument.connect?.(panner)
    instrument.triggerAttackRelease(noteInput, durationSeconds, Tone.now(), velocity)
    const timeoutId = window.setTimeout(() => {
      panner.dispose()
      instrument.dispose()
      if (activeOneShotPreview?.instrument === instrument) {
        activeOneShotPreview = null
      }
    }, Math.max(900, durationSeconds * 1000 + 650))
    activeOneShotPreview = { instrument, timeoutId }
    return
  }

  instrument.triggerAttackRelease(noteInput, durationSeconds, Tone.now(), velocity)
  const timeoutId = window.setTimeout(() => {
    instrument.dispose()
    if (activeOneShotPreview?.instrument === instrument) {
      activeOneShotPreview = null
    }
  }, Math.max(900, durationSeconds * 1000 + 650))
  activeOneShotPreview = { instrument, timeoutId }
}
