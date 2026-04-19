import lameSource from 'lamejs/lame.min.js?raw'
import { getProgramFromInstrumentId } from '../midi/generalMidi'
import type { Note, Project, Track } from '../../types/music'

const SAMPLE_RATE = 44100
const MP3_KBPS = 160
const ENCODE_CHUNK_SIZE = 1152
const EXPORT_HEADROOM = 0.92

type Mp3Encoder = {
  encodeBuffer: (left: Int16Array, right?: Int16Array) => Int8Array
  flush: () => Int8Array
}

type LameBundle = {
  Mp3Encoder: new (channels: number, sampleRate: number, kbps: number) => Mp3Encoder
}

let lameBundle: LameBundle | null = null

function getLameBundle() {
  if (!lameBundle) {
    lameBundle = new Function(`${lameSource}; return lamejs;`)() as LameBundle
  }

  return lameBundle
}

function getProjectEndBeat(project: Project) {
  const noteEndBeat = Object.values(project.notesByTrack).reduce(
    (latestEnd, notes) =>
      Math.max(
        latestEnd,
        notes.reduce((trackEnd, note) => Math.max(trackEnd, note.startBeat + note.durationBeats), 0),
      ),
    0,
  )

  return Math.max(1, noteEndBeat)
}

function getWaveform(track: Track): OscillatorType {
  const program = getProgramFromInstrumentId(track.instrumentId)
  if (track.instrumentId === 'drums') return 'triangle'
  if (program !== null && program >= 40 && program < 64) return 'sawtooth'
  if (program !== null && program >= 64 && program < 80) return 'triangle'
  if (program !== null && program >= 80 && program < 104) return 'square'
  return 'sine'
}

function getMidiFrequency(pitch: number) {
  return 440 * 2 ** ((pitch - 69) / 12)
}

function scheduleNote(
  context: OfflineAudioContext,
  destination: AudioNode,
  track: Track,
  note: Note,
  tempo: number,
) {
  const startSeconds = (note.startBeat * 60) / tempo
  const durationSeconds = Math.max(0.04, (note.durationBeats * 60) / tempo)
  const endSeconds = startSeconds + durationSeconds
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  const panner = context.createStereoPanner()
  const attackSeconds = Math.min(0.02, durationSeconds * 0.2)
  const releaseSeconds = Math.min(0.12, durationSeconds * 0.45)
  const peakGain = Math.min(
    0.34,
    Math.max(0.02, note.velocity * (note.volume ?? 1) * (note.expression ?? 1) * track.volume * 0.24),
  )

  oscillator.type = getWaveform(track)
  oscillator.frequency.setValueAtTime(getMidiFrequency(note.pitch + (note.pitchBend ?? 0)), startSeconds)
  gain.gain.setValueAtTime(0.0001, startSeconds)
  gain.gain.exponentialRampToValueAtTime(peakGain, startSeconds + attackSeconds)
  gain.gain.setValueAtTime(peakGain, Math.max(startSeconds + attackSeconds, endSeconds - releaseSeconds))
  gain.gain.exponentialRampToValueAtTime(0.0001, endSeconds)
  panner.pan.setValueAtTime(Math.max(-1, Math.min(1, note.pan ?? 0)), startSeconds)

  oscillator.connect(gain)
  gain.connect(panner)
  panner.connect(destination)
  oscillator.start(startSeconds)
  oscillator.stop(endSeconds + 0.02)
}

function floatToInt16Samples(channel: Float32Array, gain: number) {
  const samples = new Int16Array(channel.length)

  for (let index = 0; index < channel.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, channel[index] * gain))
    samples[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
  }

  return samples
}

function getNormalizeGain(buffer: AudioBuffer) {
  let peak = 0

  for (let channelIndex = 0; channelIndex < buffer.numberOfChannels; channelIndex += 1) {
    const channel = buffer.getChannelData(channelIndex)
    for (let index = 0; index < channel.length; index += 1) {
      peak = Math.max(peak, Math.abs(channel[index]))
    }
  }

  return peak > 0 ? Math.min(1, EXPORT_HEADROOM / peak) : 1
}

function encodeMp3(buffer: AudioBuffer) {
  const normalizeGain = getNormalizeGain(buffer)
  const left = floatToInt16Samples(buffer.getChannelData(0), normalizeGain)
  const right = floatToInt16Samples(
    buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : buffer.getChannelData(0),
    normalizeGain,
  )
  const Mp3Encoder = getLameBundle().Mp3Encoder
  const encoder = new Mp3Encoder(2, buffer.sampleRate, MP3_KBPS)
  const chunks: Int8Array[] = []

  for (let index = 0; index < left.length; index += ENCODE_CHUNK_SIZE) {
    const leftChunk = left.subarray(index, index + ENCODE_CHUNK_SIZE)
    const rightChunk = right.subarray(index, index + ENCODE_CHUNK_SIZE)
    const chunk = encoder.encodeBuffer(leftChunk, rightChunk)
    if (chunk.length > 0) chunks.push(chunk)
  }

  const flushChunk = encoder.flush()
  if (flushChunk.length > 0) chunks.push(flushChunk)

  return new Blob(chunks.map((chunk) => chunk.slice().buffer), { type: 'audio/mpeg' })
}

export async function exportMp3Project(project: Project) {
  const tempo = Math.max(1, project.tempo || 120)
  const durationSeconds = Math.max(1, (getProjectEndBeat(project) * 60) / tempo + 1)
  const context = new OfflineAudioContext(2, Math.ceil(durationSeconds * SAMPLE_RATE), SAMPLE_RATE)
  const compressor = context.createDynamicsCompressor()

  compressor.threshold.setValueAtTime(-16, 0)
  compressor.knee.setValueAtTime(18, 0)
  compressor.ratio.setValueAtTime(4, 0)
  compressor.attack.setValueAtTime(0.006, 0)
  compressor.release.setValueAtTime(0.18, 0)
  compressor.connect(context.destination)

  project.tracks.forEach((track) => {
    if (track.mute) return

    const notes = project.notesByTrack[track.id] ?? []
    notes.forEach((note) => scheduleNote(context, compressor, track, note, tempo))
  })

  const renderedBuffer = await context.startRendering()
  return encodeMp3(renderedBuffer)
}
