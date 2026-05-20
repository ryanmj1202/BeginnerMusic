const CLICK_DURATION_SECONDS = 0.045
const CLICK_RELEASE_SECONDS = 0.035

// Schedules one short metronome click on the supplied Web Audio context.
export function scheduleMetronomeClick(
  audioContext: BaseAudioContext,
  startTime: number,
  accented: boolean,
  volume: number,
) {
  const oscillator = audioContext.createOscillator()
  const gain = audioContext.createGain()
  const safeVolume = Math.max(0, Math.min(1, volume))
  const peakVolume = safeVolume * (accented ? 0.9 : 0.58)

  oscillator.type = 'square'
  oscillator.frequency.setValueAtTime(accented ? 1320 : 880, startTime)
  gain.gain.setValueAtTime(0.0001, startTime)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peakVolume), startTime + 0.004)
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + CLICK_DURATION_SECONDS)

  oscillator.connect(gain)
  gain.connect(audioContext.destination)
  oscillator.start(startTime)
  oscillator.stop(startTime + CLICK_DURATION_SECONDS + CLICK_RELEASE_SECONDS)
  oscillator.onended = () => {
    oscillator.disconnect()
    gain.disconnect()
  }
}
