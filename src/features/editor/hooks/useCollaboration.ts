import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { Project } from '../../../types/music'
import {
  createCollaborationRoom,
  getCollaborationErrorMessage,
  getFirebaseConfigError,
  joinCollaborationRoomOnServer,
  requestCollaborationNotes,
  subscribeCollaborationRoom,
  updateCollaborationCursor,
  updateCollaborationProject,
  updateCollaborationSelection,
  type CollaborationSubscription,
} from '../utils/collaborationServer'

const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

type RemoteCursor = {
  x: number
  y: number
} | null

type UseCollaborationOptions = {
  draggingNoteId: string | null
  pianoRollRef: RefObject<HTMLDivElement | null>
  project: Project
  projectRef: RefObject<Project>
  resizingNoteId: string | null
  selectedNoteIds: string[]
  setProject: (updater: (project: Project) => Project) => void
}

function createCode() {
  const bytes = new Uint8Array(5)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => CODE_CHARS[byte % CODE_CHARS.length]).join('')
}

function getClientId() {
  const key = 'beginner-music-collaboration-client-id'
  const saved = localStorage.getItem(key)
  if (saved) return saved

  const next = crypto.randomUUID()
  localStorage.setItem(key, next)
  return next
}

export function useCollaboration({
  draggingNoteId,
  pianoRollRef,
  project,
  projectRef,
  resizingNoteId,
  selectedNoteIds,
  setProject,
}: UseCollaborationOptions) {
  const clientIdRef = useRef(getClientId())
  const subscriptionRef = useRef<CollaborationSubscription | null>(null)
  const applyingRemoteProjectRef = useRef(false)
  const cursorFrameRef = useRef(0)
  const pendingCursorRef = useRef<{ x: number; y: number } | null>(null)
  const [collaborationCode, setCollaborationCode] = useState<string | null>(null)
  const [collaborationDialogOpen, setCollaborationDialogOpen] = useState(false)
  const [selectedCollaborationMode, setSelectedCollaborationMode] = useState<'create' | 'join' | null>(null)
  const [collaborationJoining, setCollaborationJoining] = useState(false)
  const [collaborationToast, setCollaborationToast] = useState<{
    id: number
    message: string
    tone: 'error' | 'success'
  } | null>(null)
  const [remoteCursor, setRemoteCursor] = useState<RemoteCursor>(null)
  const [remoteSelectedNoteIds, setRemoteSelectedNoteIds] = useState<string[]>([])

  const showCollaborationToast = useCallback((message: string, tone: 'error' | 'success') => {
    const id = Date.now()
    setCollaborationToast({ id, message, tone })
    window.setTimeout(() => {
      setCollaborationToast((current) => (current?.id === id ? null : current))
    }, 3000)
  }, [])

  const dismissCollaborationToast = useCallback(() => {
    setCollaborationToast(null)
  }, [])

  const connectRoom = useCallback((code: string) => {
    subscriptionRef.current?.unsubscribe()
    subscriptionRef.current = subscribeCollaborationRoom(code, clientIdRef.current, (remoteState) => {
      if (remoteState.cursor) setRemoteCursor(remoteState.cursor)
      setRemoteSelectedNoteIds(remoteState.selectedNoteIds)

      if (remoteState.project || remoteState.notesByTrack) {
        applyingRemoteProjectRef.current = true
        setProject((current) => (
          remoteState.project ?? {
            ...current,
            notesByTrack: remoteState.notesByTrack ?? current.notesByTrack,
          }
        ))
        window.setTimeout(() => {
          applyingRemoteProjectRef.current = false
        }, 0)
      }
    })
    setCollaborationCode(code)
  }, [setProject])

  const openCreateCollaborationRoom = useCallback(async () => {
    const configError = getFirebaseConfigError()
    if (configError) {
      showCollaborationToast(configError, 'error')
      return
    }

    const code = createCode()
    try {
      await createCollaborationRoom(code, clientIdRef.current, projectRef.current ?? project)
      setSelectedCollaborationMode('create')
      connectRoom(code)
    } catch (error) {
      console.error(error)
      showCollaborationToast(getCollaborationErrorMessage(error), 'error')
    }
  }, [connectRoom, project, projectRef, showCollaborationToast])

  const openJoinCollaborationRoom = useCallback(() => {
    setSelectedCollaborationMode('join')
  }, [])

  const joinCollaborationRoom = useCallback(async (code: string) => {
    const normalizedCode = code.toUpperCase()
    if (normalizedCode.length !== 5) {
      showCollaborationToast('존재하지 않는 참여 코드입니다.', 'error')
      return
    }

    const configError = getFirebaseConfigError()
    if (configError) {
      showCollaborationToast(configError, 'error')
      return
    }

    let roomExists = false
    try {
      roomExists = await joinCollaborationRoomOnServer(normalizedCode, clientIdRef.current)
    } catch (error) {
      console.error(error)
      showCollaborationToast(getCollaborationErrorMessage(error), 'error')
      return
    }
    if (!roomExists) {
      showCollaborationToast('존재하지 않는 참여 코드입니다.', 'error')
      return
    }

    setCollaborationJoining(true)
    window.setTimeout(() => {
      connectRoom(normalizedCode)
      setCollaborationDialogOpen(false)
      setCollaborationJoining(false)
      void requestCollaborationNotes(normalizedCode, clientIdRef.current).catch(() => {})
    }, 850)
  }, [connectRoom, showCollaborationToast])

  useEffect(() => {
    if (!collaborationCode || applyingRemoteProjectRef.current) return

    void updateCollaborationProject(collaborationCode, clientIdRef.current, project).catch(() => {})
  }, [collaborationCode, project])

  useEffect(() => {
    if (!collaborationCode) return

    void updateCollaborationSelection(
      collaborationCode,
      clientIdRef.current,
      Array.from(new Set([...(draggingNoteId ? [draggingNoteId] : []), ...(resizingNoteId ? [resizingNoteId] : []), ...selectedNoteIds])),
    ).catch(() => {})
  }, [collaborationCode, draggingNoteId, resizingNoteId, selectedNoteIds])

  useEffect(() => {
    if (!collaborationCode) return

    const roll = pianoRollRef.current
    if (!roll) return

    const sendCursor = () => {
      cursorFrameRef.current = 0
      const cursor = pendingCursorRef.current
      if (!cursor) return
      void updateCollaborationCursor(collaborationCode, clientIdRef.current, cursor).catch(() => {})
    }

    const handlePointerMove = (event: PointerEvent) => {
      const rect = roll.getBoundingClientRect()
      pendingCursorRef.current = {
        x: event.clientX - rect.left + roll.scrollLeft,
        y: event.clientY - rect.top + roll.scrollTop,
      }
      if (!cursorFrameRef.current) {
        cursorFrameRef.current = window.requestAnimationFrame(sendCursor)
      }
    }

    roll.addEventListener('pointermove', handlePointerMove)
    return () => {
      roll.removeEventListener('pointermove', handlePointerMove)
      if (cursorFrameRef.current) window.cancelAnimationFrame(cursorFrameRef.current)
      cursorFrameRef.current = 0
    }
  }, [collaborationCode, pianoRollRef])

  useEffect(() => () => subscriptionRef.current?.unsubscribe(), [])

  const collaborationDialogProps = useMemo(() => ({
    closeCollaborationDialog: () => {
      setCollaborationDialogOpen(false)
      setSelectedCollaborationMode(null)
    },
    collaborationCode,
    collaborationDialogOpen,
    collaborationToast,
    dismissCollaborationToast,
    joinCollaborationRoom,
    openCreateCollaborationRoom,
    openJoinCollaborationRoom,
    selectedCollaborationMode,
    showCollaborationToast,
  }), [
    collaborationCode,
    collaborationDialogOpen,
    collaborationToast,
    dismissCollaborationToast,
    joinCollaborationRoom,
    openCreateCollaborationRoom,
    openJoinCollaborationRoom,
    selectedCollaborationMode,
    showCollaborationToast,
  ])

  return {
    collaborationDialogProps,
    collaborationJoining,
    openCollaborationDialog: () => {
      setCollaborationDialogOpen(true)
      setSelectedCollaborationMode(null)
    },
    remoteCursor,
    remoteSelectedNoteIds,
  }
}
