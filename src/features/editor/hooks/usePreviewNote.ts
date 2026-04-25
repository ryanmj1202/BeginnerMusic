import type {
  Dispatch,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
} from 'react'
import {
  changePreviewNote,
  disposePreviewNote,
  startPreviewNote,
  stopPreviewNote,
  type HeldPreview,
} from '../../../lib/audio/toneTransport'
import type { InstrumentId } from '../../../types/music'

type UsePreviewNoteOptions = {
  heldPreviewRef: MutableRefObject<HeldPreview | null>
  keyPreviewRef: MutableRefObject<{ active: boolean }>
  previewTokenRef: MutableRefObject<number>
  selectedInstrumentId?: InstrumentId
  setPressedPitch: Dispatch<SetStateAction<number | null>>
}

export function usePreviewNote({
  heldPreviewRef,
  keyPreviewRef,
  previewTokenRef,
  selectedInstrumentId,
  setPressedPitch,
}: UsePreviewNoteOptions) {
  function stopHeldPreview() {
    previewTokenRef.current += 1
    stopPreviewNote(heldPreviewRef.current)
    heldPreviewRef.current = null
    setPressedPitch(null)
  }

  function startHeldPreview(pitch: number, velocity = 0.75, instrumentId?: InstrumentId) {
    const previewInstrumentId = instrumentId ?? selectedInstrumentId
    if (!previewInstrumentId) return

    stopHeldPreview()
    setPressedPitch(pitch)
    const token = previewTokenRef.current
    void startPreviewNote(previewInstrumentId, pitch, velocity).then((preview) => {
      if (token !== previewTokenRef.current) {
        stopPreviewNote(preview)
        return
      }
      heldPreviewRef.current = preview
    })
  }

  function changeHeldPreviewPitch(pitch: number, velocity = 0.75, instrumentId?: InstrumentId) {
    if (!heldPreviewRef.current) {
      startHeldPreview(pitch, velocity, instrumentId)
      return
    }

    if (heldPreviewRef.current.pitch !== pitch) {
      previewTokenRef.current += 1
      disposePreviewNote(heldPreviewRef.current)
      heldPreviewRef.current = null
      setPressedPitch(pitch)
      const token = previewTokenRef.current
      void startPreviewNote(instrumentId ?? selectedInstrumentId ?? 'gm-0', pitch, velocity).then((preview) => {
        if (token !== previewTokenRef.current) {
          disposePreviewNote(preview)
          return
        }
        heldPreviewRef.current = preview
      })
      return
    }

    setPressedPitch(pitch)
    changePreviewNote(heldPreviewRef.current, pitch, velocity)
  }

  function beginKeyPreview(pitch: number, event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return

    event.preventDefault()
    keyPreviewRef.current.active = true
    startHeldPreview(pitch)
  }

  function continueKeyPreview(pitch: number) {
    if (!keyPreviewRef.current.active) return
    changeHeldPreviewPitch(pitch)
  }

  return {
    beginKeyPreview,
    changeHeldPreviewPitch,
    continueKeyPreview,
    startHeldPreview,
    stopHeldPreview,
  }
}
