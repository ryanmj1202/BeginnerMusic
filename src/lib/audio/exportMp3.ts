import lameSource from 'lamejs/lame.min.js?raw'
import {
  FLUID_SOUNDFONT_BASE_URL,
  ORCHESTRAL_SOUNDFONT_BASE_URL,
  getOnlineSoundFontBaseUrl,
  getProgramFromInstrumentId,
  getSoundFontInstrumentName,
} from '../midi/generalMidi'
import { expandProjectForArrangement } from '../arrangement/trackArrangement'
import type { Note, Project, Track } from '../../types/music'

const SAMPLE_RATE = 44100
const MP3_KBPS = 160
const ENCODE_CHUNK_SIZE = 1152
const EXPORT_HEADROOM = 0.98
const TEMPO_INPUT_MIN = 1
const TEMPO_INPUT_MAX = 999
const SOUNDFONT_ROOT_NOTES = [36, 48, 60, 72, 84]
const SOUNDFONT_NOTE_NAMES = ['C2', 'C3', 'C4', 'C5', 'C6']

type Mp3Encoder = {
  encodeBuffer: (left: Int16Array, right?: Int16Array) => Int8Array
  flush: () => Int8Array
}

type LameBundle = {
  Mp3Encoder: new (channels: number, sampleRate: number, kbps: number) => Mp3Encoder
}

let lameBundle: LameBundle | null = null
const soundFontSampleCache = new Map<string, Promise<ArrayBuffer>>()

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
  const audioEndBeat = (project.audioClips ?? []).reduce(
    (latestEnd, clip) => Math.max(latestEnd, clip.startBeat + clip.durationBeats),
    0,
  )

  return Math.max(1, noteEndBeat, audioEndBeat)
}

function clampTempoValue(tempo: number | undefined, fallback: number) {
  const safeTempo = Number.isFinite(tempo) ? Number(tempo) : fallback
  return Math.max(TEMPO_INPUT_MIN, Math.min(TEMPO_INPUT_MAX, safeTempo))
}

function getTempoSegments(project: Project, totalBeats: number) {
  const safeTotalBeats = Math.max(1, totalBeats)
  const sections = [...(project.tempoSections ?? [])]
    .map((section) => ({
      startBeat: Math.max(0, Math.min(safeTotalBeats, section.startBeat ?? 0)),
      endBeat: Math.max(0.25, Math.min(safeTotalBeats, section.endBeat ?? safeTotalBeats)),
      tempo: clampTempoValue(section.tempo, project.tempo),
    }))
    .filter((section) => section.endBeat > section.startBeat)
    .sort((left, right) => left.startBeat - right.startBeat)
  const segments: Array<{ startBeat: number; endBeat: number; tempo: number }> = []
  let cursor = 0

  sections.forEach((section) => {
    const startBeat = Math.max(cursor, section.startBeat)
    const endBeat = Math.max(startBeat + 0.25, section.endBeat)

    if (startBeat > cursor) {
      segments.push({ startBeat: cursor, endBeat: startBeat, tempo: clampTempoValue(project.tempo, 120) })
    }

    segments.push({ startBeat, endBeat, tempo: section.tempo })
    cursor = endBeat
  })

  if (cursor < safeTotalBeats) {
    segments.push({ startBeat: cursor, endBeat: safeTotalBeats, tempo: clampTempoValue(project.tempo, 120) })
  }

  return segments.length > 0 ? segments : [{ startBeat: 0, endBeat: safeTotalBeats, tempo: clampTempoValue(project.tempo, 120) }]
}

function getSecondsBetweenBeats(project: Project, startBeat: number, endBeat: number, totalBeats: number) {
  const segments = getTempoSegments(project, totalBeats)
  const safeStartBeat = Math.max(0, startBeat)
  const safeEndBeat = Math.max(safeStartBeat, endBeat)
  let seconds = 0

  segments.forEach((segment) => {
    const overlapStart = Math.max(segment.startBeat, safeStartBeat)
    const overlapEnd = Math.min(segment.endBeat, safeEndBeat)
    if (overlapEnd <= overlapStart) return
    seconds += ((overlapEnd - overlapStart) * 60) / segment.tempo
  })

  return seconds
}

function getWaveform(track: Track): OscillatorType {
  const program = getProgramFromInstrumentId(track.instrumentId)
  if (isDrumTrack(track)) return 'triangle'
  if (program !== null && program >= 40 && program < 64) return 'sawtooth'
  if (program !== null && program >= 64 && program < 80) return 'triangle'
  if (program !== null && program >= 80 && program < 104) return 'square'
  return 'sine'
}

function isDrumTrack(track: Track) {
  return track.instrumentId === 'drums' || track.instrumentId === 'standard-drums'
}

function getMidiFrequency(pitch: number) {
  return 440 * 2 ** ((pitch - 69) / 12)
}

function getNoteGain(note: Note, track: Track) {
  return note.velocity * (note.volume ?? 1) * (note.expression ?? 1) * track.volume
}

function connectWithNoteReverb(
  context: OfflineAudioContext,
  source: AudioNode,
  destination: AudioNode,
  reverb: number | undefined,
) {
  const amount = Math.max(0, Math.min(1, reverb ?? 0))
  if (amount <= 0.01) {
    source.connect(destination)
    return
  }

  const delay = context.createDelay(0.8)
  const feedback = context.createGain()
  const wet = context.createGain()
  delay.delayTime.setValueAtTime(0.06 + amount * 0.16, 0)
  feedback.gain.setValueAtTime(Math.min(0.62, 0.16 + amount * 0.46), 0)
  wet.gain.setValueAtTime(Math.min(0.58, 0.18 + amount * 0.4), 0)
  source.connect(destination)
  source.connect(delay)
  delay.connect(feedback)
  feedback.connect(delay)
  delay.connect(wet)
  wet.connect(destination)
}

function getSoundFontBaseUrl(track: Track) {
  const onlineBaseUrl = getOnlineSoundFontBaseUrl(track.instrumentId)
  if (onlineBaseUrl) return onlineBaseUrl

  const program = getProgramFromInstrumentId(track.instrumentId)
  if (program === null) return FLUID_SOUNDFONT_BASE_URL
  if (program >= 40 && program < 80) return ORCHESTRAL_SOUNDFONT_BASE_URL
  return FLUID_SOUNDFONT_BASE_URL
}

function getNearestSoundFontRoot(pitch: number) {
  let nearestIndex = 0
  let nearestDistance = Number.POSITIVE_INFINITY

  SOUNDFONT_ROOT_NOTES.forEach((rootPitch, index) => {
    const distance = Math.abs(pitch - rootPitch)
    if (distance >= nearestDistance) return
    nearestIndex = index
    nearestDistance = distance
  })

  return {
    name: SOUNDFONT_NOTE_NAMES[nearestIndex],
    pitch: SOUNDFONT_ROOT_NOTES[nearestIndex],
  }
}

function fetchSoundFontSample(url: string) {
  const cached = soundFontSampleCache.get(url)
  if (cached) return cached

  const pending = fetch(url).then((response) => {
    if (!response.ok) throw new Error(`SoundFont sample failed: ${response.status}`)
    return response.arrayBuffer()
  })
  soundFontSampleCache.set(url, pending)
  return pending
}

async function scheduleSoundFontNote(
  context: OfflineAudioContext,
  destination: AudioNode,
  project: Project,
  totalBeats: number,
  track: Track,
  note: Note,
) {
  const soundFontName = getSoundFontInstrumentName(track.instrumentId)
  if (!soundFontName) return false

  const root = getNearestSoundFontRoot(note.pitch)
  const url = `${getSoundFontBaseUrl(track)}${soundFontName}-mp3/${root.name}.mp3`
  const sampleData = await fetchSoundFontSample(url)
  const buffer = await context.decodeAudioData(sampleData.slice(0))
  const startSeconds = getSecondsBetweenBeats(project, 0, note.startBeat, totalBeats)
  const durationSeconds = Math.max(0.04, getSecondsBetweenBeats(project, note.startBeat, note.startBeat + note.durationBeats, totalBeats))
  const releaseSeconds = Math.min(0.18, durationSeconds * 0.35)
  const endSeconds = startSeconds + durationSeconds
  const source = context.createBufferSource()
  const gain = context.createGain()
  const panner = context.createStereoPanner()
  const playbackRate = 2 ** ((note.pitch + (note.pitchBend ?? 0) - root.pitch) / 12)

  source.buffer = buffer
  source.playbackRate.setValueAtTime(playbackRate, startSeconds)
  gain.gain.setValueAtTime(0.0001, startSeconds)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, Math.min(1.1, getNoteGain(note, track) * 0.9)), startSeconds + 0.006)
  gain.gain.setValueAtTime(Math.max(0.0001, Math.min(1.1, getNoteGain(note, track) * 0.9)), Math.max(startSeconds + 0.006, endSeconds - releaseSeconds))
  gain.gain.exponentialRampToValueAtTime(0.0001, endSeconds)
  panner.pan.setValueAtTime(Math.max(-1, Math.min(1, (track.pan ?? 0) + (note.pan ?? 0))), startSeconds)
  source.connect(gain)
  gain.connect(panner)
  connectWithNoteReverb(context, panner, destination, note.reverb)
  source.start(startSeconds)
  source.stop(Math.min(endSeconds + 0.08, startSeconds + buffer.duration / playbackRate))
  return true
}

async function scheduleNote(
  context: OfflineAudioContext,
  destination: AudioNode,
  project: Project,
  totalBeats: number,
  track: Track,
  note: Note,
) {
  if (isDrumTrack(track)) {
    scheduleDrumNote(context, destination, project, totalBeats, track, note)
    return
  }

  try {
    if (await scheduleSoundFontNote(context, destination, project, totalBeats, track, note)) return
  } catch {
    scheduleSynthNote(context, destination, project, totalBeats, track, note)
    return
  }

  scheduleSynthNote(context, destination, project, totalBeats, track, note)
}

function scheduleSynthNote(
  context: OfflineAudioContext,
  destination: AudioNode,
  project: Project,
  totalBeats: number,
  track: Track,
  note: Note,
) {
  const startSeconds = getSecondsBetweenBeats(project, 0, note.startBeat, totalBeats)
  const durationSeconds = Math.max(0.04, getSecondsBetweenBeats(project, note.startBeat, note.startBeat + note.durationBeats, totalBeats))
  const endSeconds = startSeconds + durationSeconds
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  const panner = context.createStereoPanner()
  const attackSeconds = Math.min(0.02, durationSeconds * 0.2)
  const releaseSeconds = Math.min(0.12, durationSeconds * 0.45)
  const peakGain = Math.min(
    0.34,
    Math.max(0.02, getNoteGain(note, track) * 0.24),
  )
  const baseFrequency = getMidiFrequency(note.pitch + (note.pitchBend ?? 0))

  oscillator.type = getWaveform(track)
  oscillator.frequency.setValueAtTime(baseFrequency, startSeconds)
  if ((note.modulation ?? 0) > 0.01) {
    const depth = Math.min(0.18, Math.max(0, note.modulation ?? 0) * 0.18)
    const rate = 6.8
    const steps = Math.max(8, Math.ceil(durationSeconds * rate * 8))
    for (let index = 0; index <= steps; index += 1) {
      const progress = index / steps
      const time = startSeconds + progress * durationSeconds
      const semitones = Math.sin(progress * durationSeconds * rate * Math.PI * 2) * depth
      oscillator.frequency.linearRampToValueAtTime(baseFrequency * 2 ** (semitones / 12), time)
    }
  }
  gain.gain.setValueAtTime(0.0001, startSeconds)
  gain.gain.exponentialRampToValueAtTime(peakGain, startSeconds + attackSeconds)
  gain.gain.setValueAtTime(peakGain, Math.max(startSeconds + attackSeconds, endSeconds - releaseSeconds))
  gain.gain.exponentialRampToValueAtTime(0.0001, endSeconds)
  panner.pan.setValueAtTime(Math.max(-1, Math.min(1, (track.pan ?? 0) + (note.pan ?? 0))), startSeconds)

  oscillator.connect(gain)
  gain.connect(panner)
  connectWithNoteReverb(context, panner, destination, note.reverb)
  oscillator.start(startSeconds)
  oscillator.stop(endSeconds + 0.02)
}

function createNoiseBuffer(context: OfflineAudioContext, durationSeconds: number) {
  const buffer = context.createBuffer(1, Math.ceil(durationSeconds * context.sampleRate), context.sampleRate)
  const channel = buffer.getChannelData(0)

  for (let index = 0; index < channel.length; index += 1) {
    channel[index] = Math.random() * 2 - 1
  }

  return buffer
}

function scheduleDrumNoise(
  context: OfflineAudioContext,
  destination: AudioNode,
  startSeconds: number,
  durationSeconds: number,
  gainValue: number,
  pan: number,
  filterType: BiquadFilterType,
  frequency: number,
) {
  const source = context.createBufferSource()
  const filter = context.createBiquadFilter()
  const gain = context.createGain()
  const panner = context.createStereoPanner()
  const endSeconds = startSeconds + durationSeconds

  source.buffer = createNoiseBuffer(context, durationSeconds)
  filter.type = filterType
  filter.frequency.setValueAtTime(frequency, startSeconds)
  gain.gain.setValueAtTime(0.0001, startSeconds)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainValue), startSeconds + 0.002)
  gain.gain.exponentialRampToValueAtTime(0.0001, endSeconds)
  panner.pan.setValueAtTime(pan, startSeconds)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(panner)
  panner.connect(destination)
  source.start(startSeconds)
  source.stop(endSeconds + 0.02)
}

function scheduleDrumTone(
  context: OfflineAudioContext,
  destination: AudioNode,
  startSeconds: number,
  durationSeconds: number,
  gainValue: number,
  pan: number,
  startFrequency: number,
  endFrequency: number,
  type: OscillatorType = 'sine',
) {
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  const panner = context.createStereoPanner()
  const endSeconds = startSeconds + durationSeconds

  oscillator.type = type
  oscillator.frequency.setValueAtTime(startFrequency, startSeconds)
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, endSeconds)
  gain.gain.setValueAtTime(0.0001, startSeconds)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainValue), startSeconds + 0.002)
  gain.gain.exponentialRampToValueAtTime(0.0001, endSeconds)
  panner.pan.setValueAtTime(pan, startSeconds)
  oscillator.connect(gain)
  gain.connect(panner)
  panner.connect(destination)
  oscillator.start(startSeconds)
  oscillator.stop(endSeconds + 0.02)
}

function scheduleDrumNote(
  context: OfflineAudioContext,
  destination: AudioNode,
  project: Project,
  totalBeats: number,
  track: Track,
  note: Note,
) {
  const startSeconds = getSecondsBetweenBeats(project, 0, note.startBeat, totalBeats)
  const durationSeconds = getDrumDurationSeconds(
    note.pitch,
    Math.max(0.04, getSecondsBetweenBeats(project, note.startBeat, note.startBeat + note.durationBeats, totalBeats)),
  )
  const pan = Math.max(-1, Math.min(1, (track.pan ?? 0) + (note.pan ?? 0)))
  const gainValue = Math.min(0.95, Math.max(0.04, getNoteGain(note, track) * 0.78))

  if (note.pitch === 35 || note.pitch === 36) {
    scheduleDrumTone(context, destination, startSeconds, Math.min(durationSeconds, 0.36), gainValue, pan, 120, 45)
    return
  }

  if (note.pitch === 38 || note.pitch === 39 || note.pitch === 40) {
    scheduleDrumNoise(context, destination, startSeconds, Math.min(durationSeconds, 0.24), gainValue * 0.95, pan, 'bandpass', 1800)
    scheduleDrumTone(context, destination, startSeconds, 0.18, gainValue * 0.35, pan, 210, 140, 'triangle')
    return
  }

  if (note.pitch === 42 || note.pitch === 44 || note.pitch === 46) {
    const openHat = note.pitch === 46
    scheduleDrumNoise(context, destination, startSeconds, openHat ? 0.42 : 0.12, gainValue * 0.62, pan, 'highpass', 6500)
    return
  }

  if (note.pitch === 49 || note.pitch === 51 || note.pitch === 52 || note.pitch === 55 || note.pitch === 57 || note.pitch === 59) {
    scheduleDrumNoise(context, destination, startSeconds, Math.min(durationSeconds, 0.9), gainValue * 0.72, pan, 'highpass', 3600)
    return
  }

  if (note.pitch >= 41 && note.pitch <= 50) {
    const tomFrequency = 170 - (note.pitch - 41) * 10
    scheduleDrumTone(context, destination, startSeconds, Math.min(durationSeconds, 0.42), gainValue * 0.82, pan, tomFrequency, tomFrequency * 0.55)
    return
  }

  scheduleDrumNoise(context, destination, startSeconds, Math.min(durationSeconds, 0.24), gainValue * 0.7, pan, 'bandpass', 2200)
}

function getDrumDurationSeconds(pitch: number, durationSeconds: number) {
  if (pitch === 35 || pitch === 36) return Math.max(durationSeconds, 0.32)
  if (pitch === 38 || pitch === 39 || pitch === 40) return Math.max(durationSeconds, 0.42)
  if (pitch === 42 || pitch === 44) return Math.max(durationSeconds, 0.18)
  if (pitch === 46) return Math.max(durationSeconds, 0.55)
  if (pitch >= 41 && pitch <= 50) return Math.max(durationSeconds, 0.44)
  if (pitch === 49 || pitch === 51 || pitch === 52 || pitch === 55 || pitch === 57 || pitch === 59) {
    return Math.max(durationSeconds, 0.9)
  }
  return Math.max(durationSeconds, 0.28)
}

async function decodeDataUrl(context: OfflineAudioContext, dataUrl: string) {
  const response = await fetch(dataUrl)
  const arrayBuffer = await response.arrayBuffer()
  return context.decodeAudioData(arrayBuffer)
}

function scheduleAudioClip(
  context: OfflineAudioContext,
  destination: AudioNode,
  project: Project,
  totalBeats: number,
  clip: NonNullable<Project['audioClips']>[number],
  trackVolume: number,
) {
  return decodeDataUrl(context, clip.dataUrl).then((buffer) => {
    const source = context.createBufferSource()
    const gain = context.createGain()
    const panner = context.createStereoPanner()
    const startSeconds = Math.max(0, getSecondsBetweenBeats(project, 0, clip.startBeat, totalBeats))
    const plannedDurationSeconds = Math.max(0.04, getSecondsBetweenBeats(project, clip.startBeat, clip.startBeat + clip.durationBeats, totalBeats))
    const playDurationSeconds = Math.min(buffer.duration, plannedDurationSeconds)

    source.buffer = buffer
    gain.gain.setValueAtTime(Math.max(0, Math.min(1.8, clip.volume * trackVolume)), startSeconds)
    panner.pan.setValueAtTime(Math.max(-1, Math.min(1, clip.pan)), startSeconds)
    source.connect(gain)
    gain.connect(panner)
    panner.connect(destination)
    source.start(startSeconds, 0, playDurationSeconds)
  })
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
  const arrangedProject = expandProjectForArrangement(project)
  const totalBeats = getProjectEndBeat(arrangedProject)
  const durationSeconds = Math.max(1, getSecondsBetweenBeats(arrangedProject, 0, totalBeats, totalBeats) + 2.2)
  const context = new OfflineAudioContext(2, Math.ceil(durationSeconds * SAMPLE_RATE), SAMPLE_RATE)
  const master = context.createGain()
  master.gain.setValueAtTime(0.95, 0)
  master.connect(context.destination)

  await Promise.all(
    arrangedProject.tracks.flatMap((track) => {
      if (track.mute) return []
      const notes = arrangedProject.notesByTrack[track.id] ?? []
      return notes.map((note) => scheduleNote(context, master, arrangedProject, totalBeats, track, note))
    }),
  )

  await Promise.all(
    (arrangedProject.audioClips ?? []).map((clip) => {
      const track = arrangedProject.tracks.find((item) => item.id === clip.trackId)
      if (!track || track.mute) return Promise.resolve()
      return scheduleAudioClip(context, master, arrangedProject, totalBeats, clip, track.volume)
    }),
  )

  const renderedBuffer = await context.startRendering()
  return encodeMp3(renderedBuffer)
}
