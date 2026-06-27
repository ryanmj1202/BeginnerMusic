import * as Tone from 'tone'

export async function ensureAudioReady(): Promise<void> {
  if (Tone.getContext().state !== 'running') {
    await Tone.start()
  }
  Tone.getDestination().mute = false
}

export function silenceAllAudioOutput() {
  Tone.getDestination().mute = true
}
