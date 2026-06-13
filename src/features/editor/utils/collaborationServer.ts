import { getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app'
import {
  doc,
  getDoc,
  getFirestore,
  initializeFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore'
import type { Project } from '../../../types/music'

export type CollaborationRemoteState = {
  cursor: { x: number; y: number } | null
  notesByTrack: Project['notesByTrack'] | null
  selectedNoteIds: string[]
}

export type CollaborationSubscription = {
  unsubscribe: () => void
}

type CollaborationRoomDocument = {
  activeSelections?: Record<string, string[]>
  cursors?: Record<string, { x: number; y: number }>
  notesByTrack?: Project['notesByTrack']
  notesUpdatedBy?: string
}

const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
}
let collaborationDatabase: Firestore | null = null

export function getFirebaseConfigError() {
  if (!firebaseConfig.apiKey) return 'VITE_FIREBASE_API_KEY가 없습니다.'
  if (!firebaseConfig.appId) return 'VITE_FIREBASE_APP_ID가 없습니다.'
  if (!firebaseConfig.projectId) return 'VITE_FIREBASE_PROJECT_ID가 없습니다.'
  return null
}

function getCollaborationDatabase() {
  const configError = getFirebaseConfigError()
  if (configError) throw new Error(configError)

  if (collaborationDatabase) return collaborationDatabase

  const app: FirebaseApp = getApps()[0] ?? initializeApp(firebaseConfig)
  try {
    collaborationDatabase = initializeFirestore(app, {
      ignoreUndefinedProperties: true,
    })
  } catch {
    collaborationDatabase = getFirestore(app)
  }
  return collaborationDatabase
}

export function getCollaborationErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.startsWith('VITE_FIREBASE_')) return error.message

  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: unknown }).code)
    : ''

  if (code === 'permission-denied') return 'Firestore 보안 규칙에서 읽기/쓰기가 막혀 있습니다.'
  if (code === 'failed-precondition') return 'Firestore Database 생성 또는 인덱스 설정이 필요합니다.'
  if (code === 'not-found') return 'Firebase 프로젝트 또는 Firestore 데이터베이스를 찾을 수 없습니다.'
  if (code === 'unavailable') return 'Firebase 서버에 연결할 수 없습니다.'
  if (code === 'invalid-argument') return 'Firestore에 저장할 수 없는 협업 데이터가 있습니다.'

  return 'Firebase 연결에 실패했습니다.'
}

function getRoomRef(roomCode: string) {
  return doc(getCollaborationDatabase(), 'collaborationRooms', roomCode)
}

function getOtherSelectedNoteIds(activeSelections: CollaborationRoomDocument['activeSelections'], clientId: string) {
  return Object.entries(activeSelections ?? {})
    .filter(([selectionClientId]) => selectionClientId !== clientId)
    .flatMap(([, noteIds]) => noteIds)
}

function getOtherCursor(cursors: CollaborationRoomDocument['cursors'], clientId: string) {
  const remoteCursorEntry = Object.entries(cursors ?? {}).find(([cursorClientId]) => cursorClientId !== clientId)
  return remoteCursorEntry?.[1] ?? null
}

export async function createCollaborationRoom(roomCode: string, clientId: string, notesByTrack: Project['notesByTrack']) {
  await setDoc(getRoomRef(roomCode), {
    activeSelections: {
      [clientId]: [],
    },
    createdAt: serverTimestamp(),
    createdBy: clientId,
    cursors: {},
    notesByTrack,
    notesUpdatedAt: serverTimestamp(),
    notesUpdatedBy: clientId,
  })
}

export async function joinCollaborationRoomOnServer(roomCode: string, clientId: string) {
  const roomSnapshot = await getDoc(getRoomRef(roomCode))
  if (!roomSnapshot.exists()) return false

  await updateDoc(getRoomRef(roomCode), {
    [`activeSelections.${clientId}`]: [],
    updatedAt: serverTimestamp(),
  })
  return true
}

export function subscribeCollaborationRoom(
  roomCode: string,
  clientId: string,
  onRemoteState: (state: CollaborationRemoteState) => void,
): CollaborationSubscription {
  let unsubscribe: Unsubscribe = () => {}

  unsubscribe = onSnapshot(getRoomRef(roomCode), (snapshot) => {
    if (!snapshot.exists()) return

    const room = snapshot.data() as CollaborationRoomDocument
    onRemoteState({
      cursor: getOtherCursor(room.cursors, clientId),
      notesByTrack: room.notesUpdatedBy === clientId ? null : room.notesByTrack ?? null,
      selectedNoteIds: getOtherSelectedNoteIds(room.activeSelections, clientId),
    })
  })

  return { unsubscribe }
}

export async function requestCollaborationNotes(roomCode: string, _clientId: string) {
  await getDoc(getRoomRef(roomCode))
}

export async function updateCollaborationNotes(roomCode: string, clientId: string, notesByTrack: Project['notesByTrack']) {
  await updateDoc(getRoomRef(roomCode), {
    notesByTrack,
    notesUpdatedAt: serverTimestamp(),
    notesUpdatedBy: clientId,
  })
}

export async function updateCollaborationCursor(roomCode: string, clientId: string, cursor: { x: number; y: number }) {
  await updateDoc(getRoomRef(roomCode), {
    [`cursors.${clientId}`]: {
      ...cursor,
      updatedAt: Date.now(),
    },
  })
}

export async function updateCollaborationSelection(roomCode: string, clientId: string, noteIds: string[]) {
  await updateDoc(getRoomRef(roomCode), {
    [`activeSelections.${clientId}`]: noteIds,
  })
}
