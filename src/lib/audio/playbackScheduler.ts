import * as Tone from 'tone'
import type { Note } from '../../types/music'
import type { BeginnerInstrument } from './instruments/instrumentTypes'
import { RELEASE_BUFFER_SECONDS } from './instruments/instrumentRegistry'

export function getPlaybackDurationMs(notes: Note[], tempo: number): number {
  const beatSeconds = 60 / tempo
  const endBeat = notes.reduce(
    (latestEnd, note) => Math.max(latestEnd, note.startBeat + note.durationBeats),
    0,
  )

  return Math.ceil((endBeat * beatSeconds + RELEASE_BUFFER_SECONDS) * 1000)
}

export function scheduleNotes(
  instrument: BeginnerInstrument,
  notes: Note[],
  tempo: number,
  startBeat = 0,
): number {
  const beatSeconds = 60 / tempo
  const startTime = Tone.now() + 0.08
  const playableNotes = notes.filter((note) => note.startBeat + note.durationBeats > startBeat)

  playableNotes.forEach((note) => {
    const offsetBeat = Math.max(0, startBeat - note.startBeat)
    const remainingDuration = note.durationBeats - offsetBeat
    const relativeStartBeat = Math.max(0, note.startBeat - startBeat)

    const noteInput = instrument.expectsMidi
      ? note.pitch
      : Tone.Frequency(note.pitch, 'midi').toFrequency()

    instrument.triggerAttackRelease(
      noteInput,
      Math.max(0.04, remainingDuration * beatSeconds),
      startTime + relativeStartBeat * beatSeconds,
      note.velocity,
    )
  })

  return getPlaybackDurationMs(playableNotes.map((note) => ({ ...note, startBeat: Math.max(0, note.startBeat - startBeat) })), tempo)
}

export function scheduleNotesInWindow(
  instrument: BeginnerInstrument,
  notes: Note[],
  tempo: number,
  currentBeat: number,
  windowEndBeat: number,
): number {
  const beatSeconds = 60 / tempo
  const startTime = Tone.now() + 0.05
  let latestEndBeat = currentBeat

  notes
    .filter((note) => note.startBeat < windowEndBeat && note.startBeat + note.durationBeats > currentBeat)
    .forEach((note) => {
      const offsetBeat = Math.max(0, currentBeat - note.startBeat)
      const remainingDuration = note.durationBeats - offsetBeat
      const relativeStartBeat = Math.max(0, note.startBeat - currentBeat)

      const noteInput = instrument.expectsMidi
        ? note.pitch
        : Tone.Frequency(note.pitch, 'midi').toFrequency()

      instrument.triggerAttackRelease(
        noteInput,
        Math.max(0.04, remainingDuration * beatSeconds),
        startTime + relativeStartBeat * beatSeconds,
        note.velocity,
      )
      latestEndBeat = Math.max(latestEndBeat, note.startBeat + note.durationBeats)
    })

  return Math.ceil(Math.max(0, latestEndBeat - currentBeat) * beatSeconds * 1000)
}

