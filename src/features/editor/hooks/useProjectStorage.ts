import {
  useEffect,
  useRef,
  type MutableRefObject,
} from 'react'
import {
  ACTIVE_EDIT_AUTO_SAVE_DELAY_MS,
  AUTO_SAVE_DELAY_MS,
  STORAGE_KEY,
} from '../constants'
import type { Project } from '../../../types/music'
import type { NoteDrag } from '../types'

type ActiveFlagRef = MutableRefObject<{
  active: boolean
}>

type UseProjectStorageOptions = {
  project: Project
  projectRef: MutableRefObject<Project>
  resizingNoteId: string | null
  noteDragRef: MutableRefObject<NoteDrag | null>
  eraseRef: ActiveFlagRef
  rightEraseRef: ActiveFlagRef
}

export function useProjectStorage({
  project,
  projectRef,
  resizingNoteId,
  noteDragRef,
  eraseRef,
  rightEraseRef,
}: UseProjectStorageOptions) {
  const savedProjectJsonRef = useRef('')

  useEffect(() => {
    projectRef.current = project

    const isEditing =
      Boolean(resizingNoteId) ||
      Boolean(noteDragRef.current?.active) ||
      eraseRef.current.active ||
      rightEraseRef.current.active

    const saveDelay = isEditing
      ? ACTIVE_EDIT_AUTO_SAVE_DELAY_MS
      : AUTO_SAVE_DELAY_MS

    const saveTimeout = window.setTimeout(() => {
      const nextProjectJson = JSON.stringify(projectRef.current)

      if (nextProjectJson !== savedProjectJsonRef.current) {
        localStorage.setItem(STORAGE_KEY, nextProjectJson)
        savedProjectJsonRef.current = nextProjectJson
      }
    }, saveDelay)

    return () => {
      window.clearTimeout(saveTimeout)
    }
  }, [
    eraseRef,
    noteDragRef,
    project,
    projectRef,
    resizingNoteId,
    rightEraseRef,
  ])
}