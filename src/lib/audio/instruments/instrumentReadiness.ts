import type { BeginnerInstrument } from './instrumentTypes'
import { SOUNDFONT_LOAD_TIMEOUT_MS } from './instrumentRegistry'

export function waitForInstrumentReady(
  instrument: BeginnerInstrument,
  timeoutMs = SOUNDFONT_LOAD_TIMEOUT_MS,
) {
  const ready = instrument.ready
  if (!ready) return Promise.resolve()
  const effectiveTimeoutMs = instrument.readyTimeoutMs ?? timeoutMs

  return new Promise<void>((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      window.clearTimeout(timeoutId)
      resolve()
    }
    const timeoutId = window.setTimeout(finish, effectiveTimeoutMs)
    ready.then(finish, finish)
  })
}
