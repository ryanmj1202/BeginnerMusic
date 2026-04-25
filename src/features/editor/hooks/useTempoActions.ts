import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from 'react'
import {
  BEATS_PER_BAR,
  TEMPO_SECTION_DEFAULT_BARS,
} from '../constants'
import {
  clampTempoValue,
  createId,
  getTempoAtBeat,
} from '../helpers'
import type {
  Project,
  TempoSection,
} from '../../../types/music'

type UseTempoActionsOptions = {
  getCurrentPlaybackBeat: () => number
  project: Project
  projectRef: MutableRefObject<Project>
  selectedTempoSectionId: string | null
  setProject: Dispatch<SetStateAction<Project>>
  setSelectedTempoSectionId: Dispatch<SetStateAction<string | null>>
  setTempoInput: Dispatch<SetStateAction<string>>
  tempoInput: string
  tempoSections: TempoSection[]
  totalBeats: number
}

export function useTempoActions({
  getCurrentPlaybackBeat,
  project,
  projectRef,
  selectedTempoSectionId,
  setProject,
  setSelectedTempoSectionId,
  setTempoInput,
  tempoInput,
  tempoSections,
  totalBeats,
}: UseTempoActionsOptions) {
  function updateTempo(tempo: number) {
    if (!Number.isFinite(tempo) || tempo <= 0) return

    const nextTempo = clampTempoValue(tempo, project.tempo)

    if (selectedTempoSectionId) {
      updateTempoSection(selectedTempoSectionId, {
        tempo: nextTempo,
      })
      setTempoInput(String(nextTempo))
      return
    }

    setProject((current) =>
      current.tempo === nextTempo
        ? current
        : {
            ...current,
            tempo: nextTempo,
          },
    )

    setTempoInput(String(nextTempo))
  }

  function commitTempoInput() {
    const parsedTempo = Number(tempoInput)

    if (Number.isFinite(parsedTempo) && parsedTempo > 0) {
      updateTempo(parsedTempo)
      return
    }

    setTempoInput(String(project.tempo))
  }

  function changeTempoInput(value: string) {
    setTempoInput(value)

    const parsedTempo = Number(value)

    if (
      !Number.isFinite(parsedTempo) ||
      parsedTempo <= 0 ||
      value.trim() === ''
    ) {
      return
    }

    updateTempo(parsedTempo)
  }

  function createTempoSection(anchorBeat = getCurrentPlaybackBeat()): TempoSection {
    const startBeat = Math.max(
      0,
      Math.floor(anchorBeat / BEATS_PER_BAR) * BEATS_PER_BAR,
    )

    const endBeat = Math.min(
      totalBeats,
      Math.max(
        startBeat + BEATS_PER_BAR,
        startBeat + BEATS_PER_BAR * TEMPO_SECTION_DEFAULT_BARS,
      ),
    )

    return {
      id: createId('tempo'),
      name: `빠르기 구간 ${tempoSections.length + 1}`,
      startBeat,
      endBeat,
      tempo: Math.round(getTempoAtBeat(projectRef.current, startBeat, totalBeats)),
    }
  }

  function addTempoSection(anchorBeat = getCurrentPlaybackBeat()) {
    setProject((current) => {
      const nextSection = createTempoSection(anchorBeat)

      setSelectedTempoSectionId(nextSection.id)

      return {
        ...current,
        tempoSections: [
          ...(current.tempoSections ?? []),
          nextSection,
        ],
      }
    })
  }

  function updateTempoSection(sectionId: string, updates: Partial<TempoSection>) {
    setProject((current) => {
      const sortedSections = [...(current.tempoSections ?? [])].sort(
        (left, right) => left.startBeat - right.startBeat,
      )

      const sectionIndex = sortedSections.findIndex(
        (section) => section.id === sectionId,
      )

      const previousSection =
        sectionIndex > 0
          ? sortedSections[sectionIndex - 1]
          : null

      const nextSection =
        sectionIndex >= 0 && sectionIndex < sortedSections.length - 1
          ? sortedSections[sectionIndex + 1]
          : null

      const minStartBeat = previousSection?.endBeat ?? 0
      const maxEndBeat = nextSection?.startBeat ?? totalBeats

      return {
        ...current,
        tempoSections: (current.tempoSections ?? []).map((section) => {
          if (section.id !== sectionId) return section

          const nextStartBeat = Math.max(
            minStartBeat,
            Math.min(maxEndBeat - 0.25, updates.startBeat ?? section.startBeat),
          )

          const nextEndBeat = Math.max(
            nextStartBeat + 0.25,
            Math.min(maxEndBeat, updates.endBeat ?? section.endBeat),
          )

          return {
            ...section,
            ...updates,
            startBeat: nextStartBeat,
            endBeat: nextEndBeat,
            tempo: clampTempoValue(updates.tempo ?? section.tempo, current.tempo),
          }
        }),
      }
    })
  }

  function deleteTempoSection(sectionId: string) {
    if (selectedTempoSectionId === sectionId) {
      setSelectedTempoSectionId(null)
    }

    setProject((current) => ({
      ...current,
      tempoSections: (current.tempoSections ?? []).filter(
        (section) => section.id !== sectionId,
      ),
    }))
  }

  function focusTempoSection(sectionId: string) {
    setSelectedTempoSectionId(sectionId)
  }

  return {
    addTempoSection,
    changeTempoInput,
    commitTempoInput,
    deleteTempoSection,
    focusTempoSection,
    updateTempo,
    updateTempoSection,
  }
}