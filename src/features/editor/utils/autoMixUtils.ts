import { isDrumInstrument } from '../../../lib/audio/toneTransport'
import type { AutoMixSection, Note, Track } from '../../../types/music'

export function getAutoMixRole(track: Track) {
  const program = track.instrumentId.startsWith('gm-')
    ? Number(track.instrumentId.slice(3))
    : null

  if (isDrumInstrument(track.instrumentId)) return '리듬 중심'
  if (program !== null && program >= 32 && program < 40) return '저음 받침'
  if (program !== null && program >= 24 && program < 32) return '리듬 악기'
  if (program !== null && program >= 40 && program < 56) return '배경 선율'
  if (program !== null && program >= 56 && program < 64) return '주요 선율'
  if (program !== null && program >= 64 && program < 80) return '보조 선율'
  if (program !== null && program >= 80 && program < 96) return '신스 선율'
  if (program !== null && program >= 88 && program < 104) return '공간 배경'

  return '중심 악기'
}

export function getAutoMixBaseVolume(track: Track) {
  const role = getAutoMixRole(track)

  if (role === '리듬 중심') return 0.92
  if (role === '저음 받침') return 0.82
  if (role === '주요 선율') return 0.9
  if (role === '리듬 악기') return 0.68
  if (role === '배경 선율') return 0.58
  if (role === '보조 선율') return 0.62
  if (role === '신스 선율') return 0.64
  if (role === '공간 배경') return 0.48

  return 0.74
}

export function getAutoMixPan(track: Track, index: number) {
  if (isDrumInstrument(track.instrumentId)) return 0

  const role = getAutoMixRole(track)

  if (role === '저음 받침' || role === '주요 선율') return 0

  const side = index % 2 === 0 ? -1 : 1

  if (role === '리듬 악기') return side * 0.28
  if (role === '배경 선율' || role === '공간 배경') return side * 0.42

  return side * 0.18
}

export function getDefaultAutoMixPriority(track: Track) {
  if (isDrumInstrument(track.instrumentId)) return 4

  const program = track.instrumentId.startsWith('gm-')
    ? Number(track.instrumentId.slice(3))
    : null

  if (program !== null && program >= 32 && program < 40) return 4
  if (program !== null && program >= 56 && program < 64) return 4
  if (program !== null && program >= 40 && program < 56) return 3

  return 3
}

export function getSectionOverlap(note: Note, section: AutoMixSection) {
  const noteStart = note.startBeat
  const noteEnd = note.startBeat + note.durationBeats

  return Math.max(
    0,
    Math.min(noteEnd, section.endBeat) - Math.max(noteStart, section.startBeat),
  )
}

export function getAutoMixPriorityFactor(
  track: Track,
  notes: Note[],
  sections: AutoMixSection[],
) {
  if (sections.length === 0 || notes.length === 0) return 1

  let weightedPriority = 0
  let weightedOverlap = 0

  sections.forEach((section) => {
    const sectionLength = Math.max(0.25, section.endBeat - section.startBeat)
    const overlap = notes.reduce((total, note) => total + getSectionOverlap(note, section), 0)

    if (overlap <= 0) return

    const priority = section.priorities[track.id] ?? getDefaultAutoMixPriority(track)
    const intensity = Math.min(1, Math.max(0, section.intensity))
    const weight = Math.min(1, overlap / sectionLength) * intensity

    weightedPriority += priority * weight
    weightedOverlap += weight
  })

  if (weightedOverlap <= 0) return 1

  const priority = weightedPriority / weightedOverlap

  return Math.max(0.46, Math.min(1.7, 1 + (priority - 3) * 0.26))
}

export function getAutoMixNoteVolume(
  track: Track,
  note: Note,
  sections: AutoMixSection[],
) {
  if (sections.length === 0) return note.volume ?? 1

  let weightedPriority = 0
  let weightedOverlap = 0

  sections.forEach((section) => {
    const overlap = getSectionOverlap(note, section)

    if (overlap <= 0) return

    const priority = section.priorities[track.id] ?? getDefaultAutoMixPriority(track)
    const intensity = Math.min(1, Math.max(0, section.intensity))
    const weight = (overlap / Math.max(0.25, note.durationBeats)) * intensity

    weightedPriority += priority * weight
    weightedOverlap += weight
  })

  if (weightedOverlap <= 0) return note.volume ?? 1

  const priority = weightedPriority / weightedOverlap
  const nextVolume = 1 + (priority - 3) * 0.2

  return Math.round(Math.max(0.42, Math.min(1.45, nextVolume)) * 100) / 100
}