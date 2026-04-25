import {
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
import { HISTORY_LIMIT } from '../constants'
import { hasUndoableProjectChange } from '../helpers'
import type { Project } from '../../../types/music'
import type { PatternSelection, SelectionBox } from '../types'

type UseProjectHistoryOptions = {
  projectRef: MutableRefObject<Project>
  setProjectState: Dispatch<SetStateAction<Project>>
  setHistoryVersion: Dispatch<SetStateAction<number>>
  setSelectedNoteIds: Dispatch<SetStateAction<string[]>>
  setSelectionBox: Dispatch<SetStateAction<SelectionBox | null>>
  patternSelectionRef: MutableRefObject<PatternSelection | null>
}

export function useProjectHistory({
  projectRef,
  setProjectState,
  setHistoryVersion,
  setSelectedNoteIds,
  setSelectionBox,
  patternSelectionRef,
}: UseProjectHistoryOptions) {
  const undoStackRef = useRef<Project[]>([])
  const redoStackRef = useRef<Project[]>([])
  const historyBatchDepthRef = useRef(0)
  const historyBatchStartRef = useRef<Project | null>(null)

  function setProject(update: SetStateAction<Project>) {
    setProjectState((current) => {
      const nextProject = typeof update === 'function'
        ? (update as (currentProject: Project) => Project)(current)
        : update

      if (nextProject === current) return current

      if (historyBatchDepthRef.current > 0) {
        historyBatchStartRef.current ??= current
      } else if (hasUndoableProjectChange(current, nextProject)) {
        undoStackRef.current = [
          ...undoStackRef.current.slice(-(HISTORY_LIMIT - 1)),
          current,
        ]
        redoStackRef.current = []
        setHistoryVersion((version) => version + 1)
      }

      projectRef.current = nextProject
      return nextProject
    })
  }

  function beginHistoryBatch() {
    if (historyBatchDepthRef.current === 0) {
      historyBatchStartRef.current = projectRef.current
    }

    historyBatchDepthRef.current += 1
  }

  function endHistoryBatch() {
    if (historyBatchDepthRef.current === 0) return

    historyBatchDepthRef.current -= 1
    if (historyBatchDepthRef.current > 0) return

    const startProject = historyBatchStartRef.current
    historyBatchStartRef.current = null

    if (!startProject) return

    setProjectState((current) => {
      if (!hasUndoableProjectChange(startProject, current)) {
        projectRef.current = current
        return current
      }

      undoStackRef.current = [
        ...undoStackRef.current.slice(-(HISTORY_LIMIT - 1)),
        startProject,
      ]
      redoStackRef.current = []
      setHistoryVersion((version) => version + 1)
      projectRef.current = current

      return current
    })
  }

  function restoreProject(nextProject: Project) {
    projectRef.current = nextProject
    setProjectState(nextProject)
    setSelectedNoteIds([])
    setSelectionBox(null)
    patternSelectionRef.current = null
  }

  function undoProject() {
    const previousProject = undoStackRef.current.at(-1)
    if (!previousProject) return

    undoStackRef.current = undoStackRef.current.slice(0, -1)
    redoStackRef.current = [
      ...redoStackRef.current.slice(-(HISTORY_LIMIT - 1)),
      projectRef.current,
    ]

    setHistoryVersion((version) => version + 1)
    restoreProject(previousProject)
  }

  function redoProject() {
    const nextProject = redoStackRef.current.at(-1)
    if (!nextProject) return

    redoStackRef.current = redoStackRef.current.slice(0, -1)
    undoStackRef.current = [
      ...undoStackRef.current.slice(-(HISTORY_LIMIT - 1)),
      projectRef.current,
    ]

    setHistoryVersion((version) => version + 1)
    restoreProject(nextProject)
  }

  function resetProjectHistory() {
    undoStackRef.current = []
    redoStackRef.current = []
    historyBatchDepthRef.current = 0
    historyBatchStartRef.current = null
    setHistoryVersion((version) => version + 1)
  }

  return {
    beginHistoryBatch,
    canRedo: redoStackRef.current.length > 0,
    canUndo: undoStackRef.current.length > 0,
    endHistoryBatch,
    redoProject,
    resetProjectHistory,
    restoreProject,
    setProject,
    undoProject,
  }
}