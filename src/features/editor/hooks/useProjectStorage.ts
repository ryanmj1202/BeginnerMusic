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
import type { KeyboardRecordingNote, NoteDrag } from '../types'

const LARGE_PROJECT_AUTO_SAVE_DELAY_MS = 3000
const LARGE_PROJECT_DATA_URL_BYTES = 5_000_000

type ActiveFlagRef = MutableRefObject<{
  active: boolean
}>

type UseProjectStorageOptions = {
  project: Project
  projectRef: MutableRefObject<Project>
  keyboardRecordingRef?: MutableRefObject<Map<string, KeyboardRecordingNote>>
  resizingNoteId: string | null
  noteDragRef: MutableRefObject<NoteDrag | null>
  eraseRef: ActiveFlagRef
  rightEraseRef: ActiveFlagRef
}

export function useProjectStorage({
  project,
  projectRef,
  keyboardRecordingRef,
  resizingNoteId,
  noteDragRef,
  eraseRef,
  rightEraseRef,
}: UseProjectStorageOptions) {
  const savedProjectJsonRef = useRef('')

  useEffect(() => {
    projectRef.current = project

    const isEditing =
      (keyboardRecordingRef?.current.size ?? 0) > 0 ||
      Boolean(resizingNoteId) ||
      Boolean(noteDragRef.current?.active) ||
      eraseRef.current.active ||
      rightEraseRef.current.active

    const hasLargeAudioData = (project.audioClips ?? []).some((clip) =>
      clip.dataUrl.length > LARGE_PROJECT_DATA_URL_BYTES,
    )
    const saveDelay = isEditing
      ? ACTIVE_EDIT_AUTO_SAVE_DELAY_MS
      : hasLargeAudioData
        ? LARGE_PROJECT_AUTO_SAVE_DELAY_MS
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
    keyboardRecordingRef,
    noteDragRef,
    project,
    projectRef,
    resizingNoteId,
    rightEraseRef,
  ])
}
