import type {
  Dispatch,
  SetStateAction,
} from 'react'
import { isDrumInstrument } from '../../../lib/audio/toneTransport'
import type {
  AutoMixSection,
  Project,
  Track,
} from '../../../types/music'
import {
  BEATS_PER_BAR,
  DEFAULT_PROJECT_LENGTH_BEATS,
} from '../constants'
import {
  createId,
  getNotesEndBeat,
  nearlyEqual,
} from '../helpers'
import type {
  AutoMixGenrePreset,
  AutoMixReportItem,
} from '../types'
import {
  getAutoMixBaseVolume,
  getAutoMixNoteVolume,
  getAutoMixPan,
  getAutoMixPriorityFactor,
  getAutoMixRole,
  getDefaultAutoMixPriority,
} from '../utils/autoMixUtils'

type UseAutoMixActionsOptions = {
  getCurrentPlaybackBeat: () => number
  isAutoMixing: boolean
  isPlaying: boolean
  playbackBeat: number
  project: Project
  selectedAutoMixSectionId: string | null
  setAutoMixGenrePreset: Dispatch<SetStateAction<AutoMixGenrePreset>>
  setAutoMixPanelOpen: Dispatch<SetStateAction<boolean>>
  setAutoMixReport: Dispatch<SetStateAction<AutoMixReportItem[]>>
  setIsAutoMixing: Dispatch<SetStateAction<boolean>>
  setProject: Dispatch<SetStateAction<Project>>
  setSelectedAutoMixSectionId: Dispatch<SetStateAction<string | null>>
  startPlaybackAt: (startBeat: number) => Promise<void>
}

export function useAutoMixActions({
  getCurrentPlaybackBeat,
  isAutoMixing,
  isPlaying,
  playbackBeat,
  project,
  selectedAutoMixSectionId,
  setAutoMixGenrePreset,
  setAutoMixPanelOpen,
  setAutoMixReport,
  setIsAutoMixing,
  setProject,
  setSelectedAutoMixSectionId,
  startPlaybackAt,
}: UseAutoMixActionsOptions) {
  function getAutoMixFocusTrackId(section: AutoMixSection) {
    const entries = Object.entries(section.priorities)
    if (entries.length === 0) return project.tracks[0]?.id ?? ''

    return entries.reduce((best, current) => (
      current[1] > best[1] ? current : best
    ), entries[0])[0]
  }

  function autoMixTracks() {
    let report: AutoMixReportItem[] = []
    setProject((current) => {
      const mixLength = Math.max(DEFAULT_PROJECT_LENGTH_BEATS, current.lengthBeats ?? 0, getNotesEndBeat(current.notesByTrack))
      const sections = (current.autoMixSections ?? []).length > 0
        ? current.autoMixSections ?? []
        : [
          {
            id: createId('automix'),
            name: '전체 곡',
            startBeat: 0,
            endBeat: Math.max(DEFAULT_PROJECT_LENGTH_BEATS, getNotesEndBeat(current.notesByTrack)),
            intensity: 0.75,
            priorities: Object.fromEntries(
              current.tracks.map((track) => [track.id, getDefaultAutoMixPriority(track)]),
            ),
          },
        ]
      const analyzedTracks = current.tracks.map((track, index) => {
        const notes = current.notesByTrack[track.id] ?? []
        if (notes.length === 0) {
          return {
            nextPan: getAutoMixPan(track, index),
            nextVolume: Math.round(getAutoMixBaseVolume(track) * 100) / 100,
            noteCount: 0,
            role: getAutoMixRole(track),
            track,
          }
        }

        const energy = notes.reduce(
          (total, note) => total + note.durationBeats * note.velocity * note.velocity,
          0,
        )
        const density = notes.length / Math.max(1, mixLength)
        const rms = Math.sqrt(energy / Math.max(1, mixLength))
        const priorityFactor = getAutoMixPriorityFactor(track, notes, sections)
        const densityTrim = Math.max(0.72, 1 - density * 0.1)
        const loudnessTrim = Math.max(0.72, Math.min(1.18, 0.74 / Math.max(0.18, rms)))
        const baseVolume = getAutoMixBaseVolume(track)
        const nextVolume = Math.round(
          Math.max(0.24, Math.min(1, baseVolume * priorityFactor * densityTrim * loudnessTrim)) * 100,
        ) / 100

        return {
          nextPan: getAutoMixPan(track, index),
          nextVolume,
          noteCount: notes.length,
          role: getAutoMixRole(track),
          track,
        }
      })
      const nextTracks = analyzedTracks.map(({ nextPan, nextVolume, track }) => {
        return nearlyEqual(track.volume, nextVolume) && nearlyEqual(track.pan ?? 0, nextPan)
          ? track
          : { ...track, pan: nextPan, volume: nextVolume }
      })
      let notesChanged = false
      const noteChangeCounts = new Map<string, number>()
      const nextNotesByTrack = Object.fromEntries(
        current.tracks.map((track) => {
          const notes = current.notesByTrack[track.id] ?? []
          let trackNotesChanged = false
          let trackNoteChanges = 0
          const nextTrackPan = nextTracks.find((item) => item.id === track.id)?.pan ?? 0
          const nextNotes = notes.map((note) => {
            const nextVolume = getAutoMixNoteVolume(track, note, sections)
            const nextPan = Math.max(-1, Math.min(1, (note.pan ?? 0) * 0.35 + nextTrackPan * 0.65))
            if (nearlyEqual(note.volume ?? 1, nextVolume) && nearlyEqual(note.pan ?? 0, nextPan)) return note
            trackNotesChanged = true
            trackNoteChanges += 1
            return { ...note, pan: nextPan, volume: nextVolume }
          })
          if (trackNotesChanged) notesChanged = true
          noteChangeCounts.set(track.id, trackNoteChanges)
          return [
            track.id,
            trackNotesChanged ? nextNotes : notes,
          ]
        }),
      )
      report = analyzedTracks.map(({ nextPan, nextVolume, role, track }) => ({
        afterPan: nextPan,
        afterVolume: nextVolume,
        beforeVolume: track.volume,
        noteChanges: noteChangeCounts.get(track.id) ?? 0,
        role,
        trackId: track.id,
      }))

      return nextTracks.every((track, index) => track === current.tracks[index]) && !notesChanged
        ? current
        : { ...current, tracks: nextTracks, notesByTrack: nextNotesByTrack }
    })
    setAutoMixReport(report)

    if (isPlaying) {
      const restartBeat = getCurrentPlaybackBeat()
      window.setTimeout(() => {
        void startPlaybackAt(restartBeat)
      }, 0)
    }
  }

  async function runAutoMixTracks() {
    if (isAutoMixing) return
    setIsAutoMixing(true)
    setAutoMixPanelOpen(false)
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 120))
      autoMixTracks()
      await new Promise((resolve) => window.setTimeout(resolve, 360))
    } finally {
      setIsAutoMixing(false)
    }
  }

  function createAutoMixSection(current: Project, anchorBeat = playbackBeat): AutoMixSection {
    const startBeat = Math.max(0, Math.floor(anchorBeat / BEATS_PER_BAR) * BEATS_PER_BAR)
    const projectEnd = Math.max(DEFAULT_PROJECT_LENGTH_BEATS, getNotesEndBeat(current.notesByTrack))
    const endBeat = Math.min(projectEnd + BEATS_PER_BAR, startBeat + BEATS_PER_BAR * 4)

    return {
      id: createId('automix'),
      name: `구간 ${(current.autoMixSections?.length ?? 0) + 1}`,
      startBeat,
      endBeat: Math.max(startBeat + BEATS_PER_BAR, endBeat),
      intensity: 0.7,
      priorities: Object.fromEntries(
        current.tracks.map((track) => [track.id, getDefaultAutoMixPriority(track)]),
      ),
    }
  }

  function createFullSongAutoMixSection(current: Project): AutoMixSection {
    const projectEnd = Math.max(
      DEFAULT_PROJECT_LENGTH_BEATS,
      getNotesEndBeat(current.notesByTrack),
      (current.audioClips ?? []).reduce((latest, clip) => Math.max(latest, clip.startBeat + clip.durationBeats), 0),
    )

    return {
      id: createId('automix'),
      name: '전체 구간',
      startBeat: 0,
      endBeat: Math.max(BEATS_PER_BAR, projectEnd),
      intensity: 0.7,
      priorities: Object.fromEntries(
        current.tracks.map((track) => [track.id, getDefaultAutoMixPriority(track)]),
      ),
    }
  }

  function getAutoMixGenrePriority(track: Track, genre: AutoMixGenrePreset) {
    const role = getAutoMixRole(track)
    const trackName = track.name.toLowerCase()
    const isAudioTrack = track.kind === 'audio' || track.instrumentId === 'audio-track'

    if (genre === 'default') return getDefaultAutoMixPriority(track)

    if (genre === 'ballad') {
      if (isAudioTrack || role === '주요 선율' || role === '중심 악기') return 5
      if (role === '배경 선율' || role === '보조 선율') return 4
      if (role === '리듬 중심' || role === '저음 받침') return 3
      return 3
    }

    if (genre === 'rock') {
      if (isDrumInstrument(track.instrumentId) || role === '저음 받침') return 5
      if (trackName.includes('guitar') || trackName.includes('기타') || role === '리듬 악기') return 4
      if (role === '주요 선율' || role === '중심 악기') return 4
      return 3
    }

    if (genre === 'hiphop') {
      if (isDrumInstrument(track.instrumentId) || role === '저음 받침') return 5
      if (isAudioTrack || role === '신스 선율' || role === '중심 악기') return 4
      return 3
    }

    if (genre === 'edm') {
      if (isDrumInstrument(track.instrumentId) || role === '저음 받침' || role === '신스 선율') return 5
      if (role === '주요 선율' || role === '리듬 악기') return 4
      if (role === '공간 배경') return 2
      return 3
    }

    if (genre === 'orchestra') {
      if (trackName.includes('violin') || trackName.includes('strings') || role === '주요 선율') return 5
      if (trackName.includes('brass') || role === '배경 선율' || role === '보조 선율') return 4
      if (isDrumInstrument(track.instrumentId)) return 3
      return 4
    }

    return getDefaultAutoMixPriority(track)
  }

  function applyAutoMixGenrePreset(nextGenre: AutoMixGenrePreset) {
    setAutoMixGenrePreset(nextGenre)
    setAutoMixPanelOpen(true)
    setProject((current) => {
      const sections = (current.autoMixSections ?? []).length > 0
        ? current.autoMixSections ?? []
        : [createFullSongAutoMixSection(current)]

      const nextSections = sections.map((section) => {
        const focusTrackId = getAutoMixFocusTrackId(section)
        return {
          ...section,
          priorities: Object.fromEntries(
            current.tracks.map((track) => [
              track.id,
              track.id === focusTrackId
                ? 5
                : getAutoMixGenrePriority(track, nextGenre),
            ]),
          ),
        }
      })

      return {
        ...current,
        autoMixSections: nextSections,
      }
    })
  }

  function focusAutoMixSection(sectionId: string) {
    setSelectedAutoMixSectionId(sectionId)
    setAutoMixPanelOpen(true)
  }

  function addAutoMixSection() {
    setAutoMixPanelOpen(true)
    setProject((current) => {
      const nextSection = createAutoMixSection(current)
      setSelectedAutoMixSectionId(nextSection.id)
      return {
        ...current,
        autoMixSections: [...(current.autoMixSections ?? []), nextSection],
      }
    })
  }

  function addAutoMixSectionAtBeat(anchorBeat: number) {
    setAutoMixPanelOpen(true)
    setProject((current) => {
      const nextSection = createAutoMixSection(current, anchorBeat)
      setSelectedAutoMixSectionId(nextSection.id)
      return {
        ...current,
        autoMixSections: [...(current.autoMixSections ?? []), nextSection],
      }
    })
  }

  function updateAutoMixSection(sectionId: string, updates: Partial<AutoMixSection>) {
    setProject((current) => ({
      ...current,
      autoMixSections: (current.autoMixSections ?? []).map((section) => (
        section.id === sectionId
          ? {
            ...section,
            ...updates,
            endBeat: Math.max(
              (updates.startBeat ?? section.startBeat) + 0.25,
              updates.endBeat ?? section.endBeat,
            ),
          }
          : section
      )),
    }))
  }

  function setAutoMixFocusTrack(sectionId: string, trackId: string) {
    setProject((current) => ({
      ...current,
      autoMixSections: (current.autoMixSections ?? []).map((section) => (
        section.id === sectionId
          ? {
            ...section,
            priorities: Object.fromEntries(
              current.tracks.map((track) => [
                track.id,
                track.id === trackId ? 5 : getDefaultAutoMixPriority(track),
              ]),
            ),
          }
          : section
      )),
    }))
  }

  function deleteAutoMixSection(sectionId: string) {
    if (selectedAutoMixSectionId === sectionId) {
      setSelectedAutoMixSectionId(null)
    }
    setProject((current) => ({
      ...current,
      autoMixSections: (current.autoMixSections ?? []).filter((section) => section.id !== sectionId),
    }))
  }

  return {
    addAutoMixSection,
    addAutoMixSectionAtBeat,
    applyAutoMix: runAutoMixTracks,
    applyAutoMixGenrePreset,
    autoMixTracks,
    deleteAutoMixSection,
    focusAutoMixSection,
    getAutoMixFocusTrackId,
    runAutoMixTracks,
    setAutoMixFocusTrack,
    updateAutoMixSection,
  }
}
