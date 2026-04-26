import { useState } from 'react'
import type { InstrumentId } from '../../../types/music'

export function useDialogState() {
  const [instrumentCategory, setInstrumentCategory] = useState('Piano')
  const [instrumentMenuTrackId, setInstrumentMenuTrackId] = useState<string | null>(null)
  const [pendingInstrumentId, setPendingInstrumentId] = useState<InstrumentId | null>(null)

  return {
    instrumentCategory,
    instrumentMenuTrackId,
    pendingInstrumentId,
    setInstrumentCategory,
    setInstrumentMenuTrackId,
    setPendingInstrumentId,
  }
}
