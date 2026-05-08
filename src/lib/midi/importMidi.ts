import { getInstrumentLabel } from './generalMidi'
import type { InstrumentId, Note, Project, Track } from '../../types/music'

type MidiEvent = {
  trackIndex: number
  channel: number
  pitch: number
  startTick: number
  endTick: number
  velocity: number
  modulation?: number
  pan?: number
}

type RawMidiEvent =
  | {
      kind: 'control'
      channel: number
      controller: number
      value: number
      tick: number
      trackIndex: number
      order: number
    }
  | {
      kind: 'noteOn'
      channel: number
      pitch: number
      velocity: number
      tick: number
      trackIndex: number
      order: number
    }
  | {
      kind: 'noteOff'
      channel: number
      pitch: number
      tick: number
      trackIndex: number
      order: number
    }

type TrackState = {
  name: string
  programByChannel: Map<number, number>
}

class MidiReader {
  private offset = 0
  private readonly bytes: Uint8Array

  constructor(bytes: Uint8Array) {
    this.bytes = bytes
  }

  get position() {
    return this.offset
  }

  set position(nextOffset: number) {
    this.offset = nextOffset
  }

  readUint8() {
    return this.bytes[this.offset++]
  }

  readUint16() {
    const value = (this.bytes[this.offset] << 8) | this.bytes[this.offset + 1]
    this.offset += 2
    return value
  }

  readUint32() {
    const value =
      (this.bytes[this.offset] << 24) |
      (this.bytes[this.offset + 1] << 16) |
      (this.bytes[this.offset + 2] << 8) |
      this.bytes[this.offset + 3]
    this.offset += 4
    return value >>> 0
  }

  readString(length: number) {
    const value = String.fromCharCode(...this.bytes.slice(this.offset, this.offset + length))
    this.offset += length
    return value
  }

  readBytes(length: number) {
    const value = this.bytes.slice(this.offset, this.offset + length)
    this.offset += length
    return value
  }

  readVariableLengthQuantity() {
    let value = 0
    let byte = 0

    do {
      byte = this.readUint8()
      value = (value << 7) | (byte & 0x7f)
    } while (byte & 0x80)

    return value
  }
}

function createImportId(prefix: string, index: number) {
  return `${prefix}-midi-${index}`
}

function programToInstrument(program: number, channel: number): InstrumentId {
  if (channel === 9) return 'drums'
  return `gm-${program}`
}

function readText(bytes: Uint8Array) {
  try {
    return new TextDecoder('utf-8').decode(bytes).trim()
  } catch {
    return ''
  }
}

function parseTrack(
  reader: MidiReader,
  trackIndex: number,
  trackLength: number,
  events: RawMidiEvent[],
  trackStates: TrackState[],
  tempos: number[],
) {
  const endOffset = reader.position + trackLength
  const controlStateByChannel = new Map<number, { modulation?: number; pan?: number }>()
  const trackState: TrackState = {
    name: `MIDI Track ${trackIndex + 1}`,
    programByChannel: new Map(),
  }
  let tick = 0
  let runningStatus = 0

  while (reader.position < endOffset) {
    tick += reader.readVariableLengthQuantity()
    let status = reader.readUint8()

    if (status < 0x80) {
      reader.position = reader.position - 1
      status = runningStatus
    } else {
      runningStatus = status
    }

    if (status === 0xff) {
      const type = reader.readUint8()
      const length = reader.readVariableLengthQuantity()
      const data = reader.readBytes(length)

      if (type === 0x03) {
        const name = readText(data)
        if (name) trackState.name = name
      }

      if (type === 0x51 && data.length >= 3) {
        const microsecondsPerBeat = (data[0] << 16) | (data[1] << 8) | data[2]
        if (microsecondsPerBeat > 0) {
          tempos.push(Math.round(60000000 / microsecondsPerBeat))
        }
      }

      continue
    }

    if (status === 0xf0 || status === 0xf7) {
      const length = reader.readVariableLengthQuantity()
      reader.position = reader.position + length
      continue
    }

    const eventType = status & 0xf0
    const channel = status & 0x0f

    if (eventType === 0xc0 || eventType === 0xd0) {
      const data1 = reader.readUint8()
      if (eventType === 0xc0) {
        trackState.programByChannel.set(channel, data1)
      }
      continue
    }

    const pitch = reader.readUint8()
    const data2 = reader.readUint8()
    const controlState = controlStateByChannel.get(channel) ?? {}

    if (eventType === 0x90 && data2 > 0) {
      events.push({
        kind: 'noteOn',
        channel,
        pitch,
        velocity: data2 / 127,
        tick,
        trackIndex,
        order: 20,
      })
      continue
    }

    if (eventType === 0xb0) {
      events.push({
        kind: 'control',
        channel,
        controller: pitch,
        value: data2,
        tick,
        trackIndex,
        order: 10,
      })
      if (pitch === 10) {
        controlStateByChannel.set(channel, {
          ...controlState,
          pan: Math.max(-1, Math.min(1, data2 / 63.5 - 1)),
        })
      }
      if (pitch === 1) {
        controlStateByChannel.set(channel, {
          ...controlState,
          modulation: Math.max(0, Math.min(1, data2 / 127)),
        })
      }
      continue
    }

    if (eventType === 0x80 || eventType === 0x90) {
      events.push({
        kind: 'noteOff',
        channel,
        pitch,
        tick,
        trackIndex,
        order: 30,
      })
    }
  }

  trackStates[trackIndex] = trackState
  reader.position = endOffset
}

export function importMidiProject(buffer: ArrayBuffer, title = '불러온 MIDI'): Project {
  const reader = new MidiReader(new Uint8Array(buffer))

  if (reader.readString(4) !== 'MThd') {
    throw new Error('Invalid MIDI header')
  }

  const headerLength = reader.readUint32()
  const format = reader.readUint16()
  const trackCount = reader.readUint16()
  const ticksPerBeat = reader.readUint16()
  reader.position = 8 + headerLength

  if (format > 2 || ticksPerBeat & 0x8000) {
    throw new Error('Unsupported MIDI format')
  }

  const events: MidiEvent[] = []
  const rawEvents: RawMidiEvent[] = []
  const trackStates: TrackState[] = []
  const tempos: number[] = []

  for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
    if (reader.readString(4) !== 'MTrk') {
      throw new Error('Invalid MIDI track')
    }

    parseTrack(reader, trackIndex, reader.readUint32(), rawEvents, trackStates, tempos)
  }

  const orderedEvents = [...rawEvents].sort((left, right) => (
    left.tick - right.tick ||
    left.order - right.order ||
    left.trackIndex - right.trackIndex
  ))
  const channelControlState = new Map<number, { modulation?: number; pan?: number }>()
  const activeNotes = new Map<string, Array<{ startTick: number; velocity: number; modulation?: number; pan?: number; trackIndex: number }>>()

  orderedEvents.forEach((event) => {
    if (event.kind === 'control') {
      const current = channelControlState.get(event.channel) ?? {}
      if (event.controller === 10) {
        const pan = Math.max(-1, Math.min(1, event.value / 63.5 - 1))
        channelControlState.set(event.channel, {
          ...current,
          pan,
        })
        activeNotes.forEach((notes, key) => {
          if (key.startsWith(`${event.channel}-`)) {
            notes.forEach((note) => {
              note.pan = pan
            })
          }
        })
      }
      if (event.controller === 1) {
        const modulation = Math.max(0, Math.min(1, event.value / 127))
        channelControlState.set(event.channel, {
          ...current,
          modulation,
        })
        activeNotes.forEach((notes, key) => {
          if (key.startsWith(`${event.channel}-`)) {
            notes.forEach((note) => {
              note.modulation = modulation
            })
          }
        })
      }
      return
    }

    const key = `${event.channel}-${event.pitch}`
    if (event.kind === 'noteOn') {
      const current = channelControlState.get(event.channel) ?? {}
      const active = activeNotes.get(key) ?? []
      active.push({
        startTick: event.tick,
        velocity: event.velocity,
        modulation: current.modulation,
        pan: current.pan,
        trackIndex: event.trackIndex,
      })
      activeNotes.set(key, active)
      return
    }

    const active = activeNotes.get(key)
    const started = active?.shift()
    if (!started) return

    events.push({
      trackIndex: started.trackIndex,
      channel: event.channel,
      pitch: event.pitch,
      startTick: started.startTick,
      endTick: event.tick,
      velocity: started.velocity,
      modulation: started.modulation,
      pan: started.pan,
    })
  })

  const usedTrackIndexes = Array.from(new Set(events.map((event) => event.trackIndex)))
  const tracks: Track[] = usedTrackIndexes.map((trackIndex, index) => {
    const state = trackStates[trackIndex]
    const firstEvent = events.find((event) => event.trackIndex === trackIndex)
    const program = state?.programByChannel.get(firstEvent?.channel ?? 0) ?? 0

    return {
      id: createImportId('track', index),
      name: state?.name || getInstrumentLabel(programToInstrument(program, firstEvent?.channel ?? 0)),
      instrumentId: programToInstrument(program, firstEvent?.channel ?? 0),
      volume: 0.85,
      mute: false,
      solo: false,
      channel: firstEvent ? firstEvent.channel + 1 : index + 1,
    }
  })
  const notesByTrack: Record<string, Note[]> = Object.fromEntries(
    tracks.map((track) => [track.id, []]),
  )

  usedTrackIndexes.forEach((trackIndex, index) => {
    const track = tracks[index]
    notesByTrack[track.id] = events
      .filter((event) => event.trackIndex === trackIndex)
      .map((event, noteIndex) => ({
        id: createImportId(`note-${index}`, noteIndex),
        pitch: event.pitch,
        startBeat: event.startTick / ticksPerBeat,
        durationBeats: Math.max(0.25, (event.endTick - event.startTick) / ticksPerBeat),
        velocity: Math.max(0.1, event.velocity),
        ...(event.modulation !== undefined ? { modulation: event.modulation } : {}),
        ...(event.pan !== undefined ? { pan: event.pan } : {}),
      }))
  })

  const fallbackTrackId = createImportId('track', 0)
  const finalTracks =
    tracks.length > 0
      ? tracks
      : [
          {
            id: fallbackTrackId,
            name: 'MIDI Track 1',
            instrumentId: 'gm-0',
            volume: 0.85,
            mute: false,
            solo: false,
            channel: 1,
          },
        ]

  return {
    version: 1,
    id: `project-midi-${Date.now()}`,
    title,
    tempo: tempos[0] ?? 120,
    timeSignature: [4, 4],
    selectedTrackId: finalTracks[0].id,
    selectedNoteId: null,
    theme: 'dark',
    tracks: finalTracks,
    notesByTrack: tracks.length > 0 ? notesByTrack : { [fallbackTrackId]: [] },
  }
}
