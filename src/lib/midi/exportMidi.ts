import { getProgramFromInstrumentId } from './generalMidi'
import type { Note, Project } from '../../types/music'

const TICKS_PER_BEAT = 480

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

function createMetaTrack(project: Project) {
  const tempo = Math.max(1, project.tempo || 120)
  const microsecondsPerBeat = Math.round(60_000_000 / tempo)
  const titleBytes = writeText(project.title || 'BeginnerMusic')
  const [numerator, denominator] = project.timeSignature ?? [4, 4]
  const denominatorPower = Math.max(0, Math.round(Math.log2(denominator || 4)))

  return createTrackChunk([
    { tick: 0, order: 0, data: [0xff, 0x03, titleBytes.length, ...titleBytes] },
    {
      tick: 0,
      order: 1,
      data: [
        0xff,
        0x51,
        0x03,
        (microsecondsPerBeat >> 16) & 0xff,
        (microsecondsPerBeat >> 8) & 0xff,
        microsecondsPerBeat & 0xff,
      ],
    },
    { tick: 0, order: 2, data: [0xff, 0x58, 0x04, numerator, denominatorPower, 24, 8] },
  ])
}

function getTrackChannel(trackIndex: number, isDrums: boolean) {
  if (isDrums) return 9
  return trackIndex >= 9 ? Math.min(15, trackIndex + 1) : trackIndex
}

function noteToEvents(note: Note, channel: number): MidiTrackEvent[] {
  const pitch = Math.max(0, Math.min(127, Math.round(note.pitch)))
  const velocity = Math.max(1, Math.min(127, Math.round(note.velocity * 127)))
  const startTick = Math.max(0, Math.round(note.startBeat * TICKS_PER_BEAT))
  const endTick = Math.max(startTick + 1, Math.round((note.startBeat + note.durationBeats) * TICKS_PER_BEAT))

  return [
    { tick: startTick, order: 20, data: [0x90 | channel, pitch, velocity] },
    { tick: endTick, order: 10, data: [0x80 | channel, pitch, 0] },
  ]
}

export function exportMidiProject(project: Project) {
  const trackChunks = [
    createMetaTrack(project),
    ...project.tracks.map((track, trackIndex) => {
      const isDrums = track.instrumentId === 'drums'
      const channel = getTrackChannel(trackIndex, isDrums)
      const program = getProgramFromInstrumentId(track.instrumentId) ?? 0
      const trackName = writeText(track.name)
      const notes = project.notesByTrack[track.id] ?? []
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
