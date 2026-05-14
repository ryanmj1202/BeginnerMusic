export function getMinimumPlaybackDrumSeconds(pitch: number, durationSeconds: number) {
  if (pitch === 35 || pitch === 36) return Math.max(durationSeconds, 0.32)
  if (pitch === 38 || pitch === 39 || pitch === 40) return Math.max(durationSeconds, 0.42)
  if (pitch === 42 || pitch === 44) return Math.max(durationSeconds, 0.18)
  if (pitch === 46) return Math.max(durationSeconds, 0.55)
  if (pitch >= 41 && pitch <= 50) return Math.max(durationSeconds, 0.44)
  if (pitch === 49 || pitch === 51 || pitch === 52 || pitch === 55 || pitch === 57 || pitch === 59) {
    return Math.max(durationSeconds, 0.9)
  }
  if (pitch >= 65 && pitch <= 81) return Math.max(durationSeconds, 0.36)
  return Math.max(durationSeconds, 0.28)
}
