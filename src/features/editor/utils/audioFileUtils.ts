import type { AudioClip, Project, Track } from '../../../types/music'
import { MIN_DURATION_BEATS, TRACK_COLORS } from '../constants'
import { createId, getTempoAtBeat } from '../helpers'

export function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(blob)
  })
}

export function getAudioDurationFromDataUrl(dataUrl: string) {
  return new Promise<number>((resolve) => {
    const audio = new Audio()
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      resolve(Number.isFinite(audio.duration) ? audio.duration : 1)
    }
    audio.onerror = () => resolve(1)
    audio.src = dataUrl
  })
}

export async function getAudioWaveform(blob: Blob, bars = 96) {
  try {
    const arrayBuffer = await blob.arrayBuffer()
    const context = new AudioContext()
    const buffer = await context.decodeAudioData(arrayBuffer.slice(0))
    const channel = buffer.getChannelData(0)
    const samplesPerBar = Math.max(1, Math.floor(channel.length / bars))
    const waveform = Array.from({ length: bars }, (_, barIndex) => {
      const start = barIndex * samplesPerBar
      const end = Math.min(channel.length, start + samplesPerBar)
      let peak = 0
      for (let index = start; index < end; index += 1) {
        peak = Math.max(peak, Math.abs(channel[index]))
      }
      return Math.round(Math.min(1, peak) * 100) / 100
    })
    await context.close()
    return waveform
  } catch {
    return Array.from({ length: bars }, (_, index) => 0.24 + Math.sin(index * 0.31) * 0.14)
  }
}

export function createAudioTrack(project: Project, trackId: string, name: string): Track {
  return {
    id: trackId,
    name,
    instrumentId: 'audio-track',
    kind: 'audio',
    volume: 0.95,
    pan: 0,
    mute: false,
    solo: false,
    channel: Math.min(16, project.tracks.length + 1),
    color: TRACK_COLORS[project.tracks.length % TRACK_COLORS.length],
  }
}

export function createAudioClip(
  project: Project,
  trackId: string,
  name: string,
  dataUrl: string,
  startBeat: number,
  totalBeats: number,
  durationSeconds: number,
  waveform?: number[],
): AudioClip {
  const tempoAtStart = getTempoAtBeat(project, startBeat, totalBeats)
  return {
    id: createId('audio'),
    trackId,
    name,
    dataUrl,
    startBeat,
    durationBeats: Math.max(MIN_DURATION_BEATS, durationSeconds / (60 / tempoAtStart)),
    volume: 1,
    pan: 0,
    waveform,
  }
}
