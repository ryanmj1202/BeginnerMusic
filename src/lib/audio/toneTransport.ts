export { ensureAudioReady, silenceAllAudioOutput } from './audioCore'
export { createInstrument } from './instruments/createInstrument'
export { getInstrumentPreviewPitch, isDrumInstrument } from './instruments/instrumentRegistry'
export { waitForInstrumentReady } from './instruments/instrumentReadiness'
export type { BeginnerInstrument, HeldPreview, InstrumentMode } from './instruments/instrumentTypes'
export { getPlaybackDurationMs, scheduleNotes, scheduleNotesInWindow } from './playbackScheduler'
export {
  changePreviewNote,
  disposePreviewNote,
  previewNote,
  startPreviewNote,
  stopAllPreviewAudio,
  stopPreviewNote,
  stopPreviewNoteImmediately,
} from './previewNote'
