import { getProgramFromInstrumentId } from './generalMidi'
import { expandProjectForArrangement } from '../arrangement/trackArrangement'
import type { Note, Project } from '../../types/music'

const TICKS_PER_BEAT = 480
const TEMPO_INPUT_MIN = 1
const TEMPO_INPUT_MAX = 999

type MidiTrackEvent = {
  data: number[]
  tick: number
  order: number
}

function writeText(text: string) {
  return Array.from(new TextEncoder().encode(text))
}

function writeUint16(value: number) {
  return [(value >> 8) & 0xff, value & 0xff]
}

function writeUint32(value: number) {
  return [
    (value >> 24) & 0xff,
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff,
  ]
}

function writeVariableLengthQuantity(value: number) {
  let buffer = value & 0x7f
  const bytes = []

  while ((value >>= 7)) {
    buffer <<= 8
    buffer |= (value & 0x7f) | 0x80
  }

  while (true) {
    bytes.push(buffer & 0xff)
    if (buffer & 0x80) {
      buffer >>= 8
      continue
    }
    break
  }

  return bytes
}

function createTrackChunk(events: MidiTrackEvent[]) {
  const sortedEvents = [...events].sort((left, right) => (
    left.tick - right.tick || left.order - right.order
  ))
  const bytes: number[] = []
  let previousTick = 0

  sortedEvents.forEach((event) => {
    bytes.push(...writeVariableLengthQuantity(Math.max(0, event.tick - previousTick)))
    bytes.push(...event.data)
    previousTick = event.tick
  })

  bytes.push(0x00, 0xff, 0x2f, 0x00)
  return [
    ...writeText('MTrk'),
    ...writeUint32(bytes.length),
    ...bytes,
  ]
}

function clampTempoValue(tempo: number | undefined, fallback: number) {
  const safeTempo = Number.isFinite(tempo) ? Number(tempo) : fallback
  return Math.max(TEMPO_INPUT_MIN, Math.min(TEMPO_INPUT_MAX, safeTempo))
}

function getProjectEndBeat(project: Project) {
  const noteEndBeat = Object.values(project.notesByTrack).reduce(
    (latestEnd, notes) => Math.max(latestEnd, ...notes.map((note) => note.startBeat + note.durationBeats), 0),
    0,
  )
  const audioEndBeat = (project.audioClips ?? []).reduce(
    (latestEnd, clip) => Math.max(latestEnd, clip.startBeat + clip.durationBeats),
    0,
  )

  return Math.max(1, noteEndBeat, audioEndBeat)
}

function getTempoSections(project: Project, totalBeats: number) {
  return [...(project.tempoSections ?? [])]
    .map((section) => ({
      startBeat: Math.max(0, Math.min(totalBeats, section.startBeat ?? 0)),
      endBeat: Math.max(0.25, Math.min(totalBeats, section.endBeat ?? totalBeats)),
      tempo: clampTempoValue(section.tempo, project.tempo),
    }))
    .filter((section) => section.endBeat > section.startBeat)
    .sort((left, right) => left.startBeat - right.startBeat)
}

function createMetaTrack(project: Project) {
  const titleBytes = writeText(project.title || 'BeginnerMusic')
  const [numerator, denominator] = project.timeSignature ?? [4, 4]
  const denominatorPower = Math.max(0, Math.round(Math.log2(denominator || 4)))
  const totalBeats = getProjectEndBeat(project)
  const tempoEvents = getTempoSections(project, totalBeats)
    .filter((section) => section.startBeat > 0)
    .map((section, index) => {
    const microsecondsPerBeat = Math.round(60_000_000 / Math.max(1, section.tempo))
    const tick = Math.max(0, Math.round(section.startBeat * TICKS_PER_BEAT))
    return {
      tick,
      order: 10 + index,
      data: [
        0xff,
        0x51,
        0x03,
        (microsecondsPerBeat >> 16) & 0xff,
        (microsecondsPerBeat >> 8) & 0xff,
        microsecondsPerBeat & 0xff,
      ],
    }
    })
  const initialTempo = clampTempoValue(project.tempo || 120, 120)
  const initialMicrosecondsPerBeat = Math.round(60_000_000 / Math.max(1, initialTempo))

  return createTrackChunk([
    { tick: 0, order: 0, data: [0xff, 0x03, titleBytes.length, ...titleBytes] },
    {
      tick: 0,
      order: 1,
      data: [
        0xff,
        0x51,
        0x03,
        (initialMicrosecondsPerBeat >> 16) & 0xff,
        (initialMicrosecondsPerBeat >> 8) & 0xff,
        initialMicrosecondsPerBeat & 0xff,
      ],
    },
    { tick: 0, order: 2, data: [0xff, 0x58, 0x04, numerator, denominatorPower, 24, 8] },
    ...tempoEvents,
  ])
}

function getTrackChannel(trackIndex: number, isDrums: boolean, channel?: number) {
  if (isDrums) return 9
  if (channel !== undefined) return Math.max(0, Math.min(15, channel - 1))
  return trackIndex >= 9 ? Math.min(15, trackIndex + 1) : trackIndex
}

function toMidi7(value: number) {
  return Math.max(0, Math.min(127, Math.round(value * 127)))
}

function createControlChange(tick: number, channel: number, controller: number, value: number, order: number) {
  return { tick, order, data: [0xb0 | channel, controller, toMidi7(value)] }
}

function createPitchBend(tick: number, channel: number, semitones: number, order: number) {
  const normalized = Math.max(-1, Math.min(1, semitones / 2))
  const bend = Math.max(0, Math.min(0x3fff, Math.round(0x2000 + normalized * 0x1fff)))
  return { tick, order, data: [0xe0 | channel, bend & 0x7f, (bend >> 7) & 0x7f] }
}

function noteToEvents(note: Note, channel: number): MidiTrackEvent[] {
  const pitch = Math.max(0, Math.min(127, Math.round(note.pitch)))
  const velocity = Math.max(1, Math.min(127, Math.round(note.velocity * 127)))
  const startTick = Math.max(0, Math.round(note.startBeat * TICKS_PER_BEAT))
  const endTick = Math.max(startTick + 1, Math.round((note.startBeat + note.durationBeats) * TICKS_PER_BEAT))
  const events: MidiTrackEvent[] = []

  if (note.volume !== undefined) events.push(createControlChange(startTick, channel, 7, note.volume, 12))
  if (note.pan !== undefined) events.push(createControlChange(startTick, channel, 10, (note.pan + 1) / 2, 13))
  if (note.expression !== undefined) events.push(createControlChange(startTick, channel, 11, note.expression, 14))
  if (note.modulation !== undefined) events.push(createControlChange(startTick, channel, 1, note.modulation, 15))
  if (note.pitchBend !== undefined) events.push(createPitchBend(startTick, channel, note.pitchBend, 18))

  events.push({ tick: startTick, order: 20, data: [0x90 | channel, pitch, velocity] })
  events.push({ tick: endTick, order: 10, data: [0x80 | channel, pitch, 0] })
  if (note.pitchBend !== undefined) events.push(createPitchBend(endTick, channel, 0, 11))
  return events
}

export function exportMidiProject(project: Project) {
  const arrangedProject = expandProjectForArrangement(project)
  const trackChunks = [
    createMetaTrack(arrangedProject),
    ...arrangedProject.tracks.map((track, trackIndex) => {
      const isDrums = track.instrumentId === 'drums' || track.instrumentId === 'standard-drums'
      const channel = getTrackChannel(trackIndex, isDrums, track.channel)
      const program = getProgramFromInstrumentId(track.instrumentId) ?? 0
      const trackName = writeText(track.name)
      const notes = arrangedProject.notesByTrack[track.id] ?? []
      const events: MidiTrackEvent[] = [
        { tick: 0, order: 0, data: [0xff, 0x03, trackName.length, ...trackName] },
      ]

      if (!isDrums) {
        events.push({ tick: 0, order: 1, data: [0xc0 | channel, program] })
      }

      notes.forEach((note) => {
        events.push(...noteToEvents(note, channel))
      })

      return createTrackChunk(events)
    }),
  ]

  const bytes = [
    ...writeText('MThd'),
    ...writeUint32(6),
    ...writeUint16(1),
    ...writeUint16(trackChunks.length),
    ...writeUint16(TICKS_PER_BEAT),
    ...trackChunks.flat(),
  ]

  return new Uint8Array(bytes)
}
