import type {
  ChangeEvent,
  Dispatch,
  DragEvent,
  MutableRefObject,
  SetStateAction,
} from 'react'
import { exportMp3Project } from '../../../lib/audio/exportMp3'
import { exportMidiProject } from '../../../lib/midi/exportMidi'
import { importMidiProject } from '../../../lib/midi/importMidi'
import type {
  Project,
  Track,
} from '../../../types/music'
import {
  createId,
  createInitialProject,
  normalizeProject,
} from '../helpers'
import type {
  EditorTab,
  PatternClipboard,
} from '../types'
import {
  blobToDataUrl,
  createAudioClip,
  createAudioTrack,
  getAudioDurationFromDataUrl,
  getAudioWaveform,
} from '../utils/audioFileUtils'

type UseFileActionsOptions = {
  audioFileInputRef: MutableRefObject<HTMLInputElement | null>
  fileInputRef: MutableRefObject<HTMLInputElement | null>
  getCurrentPlaybackBeat: () => number
  isExportingMp3: boolean
  isRecordingVoice: boolean
  mediaRecorderRef: MutableRefObject<MediaRecorder | null>
  patternClipboardRef: MutableRefObject<PatternClipboard | null>
  project: Project
  projectRef: MutableRefObject<Project>
  recordingChunksRef: MutableRefObject<Blob[]>
  recordingStartBeatRef: MutableRefObject<number>
  recordingStartMsRef: MutableRefObject<number>
  resetPlayback: () => void
  resetProjectHistory: () => void
  restoreProject: (nextProject: Project) => void
  selectedTrack: Track | undefined
  setActiveEditorTab: Dispatch<SetStateAction<EditorTab>>
  setFileMenuOpen: Dispatch<SetStateAction<boolean>>
  setIsDraggingFile: Dispatch<SetStateAction<boolean>>
  setIsExportingMp3: Dispatch<SetStateAction<boolean>>
  setIsRecordingVoice: Dispatch<SetStateAction<boolean>>
  setProject: Dispatch<SetStateAction<Project>>
  setSelectedNoteIds: Dispatch<SetStateAction<string[]>>
  snapBeatToGrid: (beat: number) => number
  totalBeats: number
}

export function useFileActions({
  audioFileInputRef,
  fileInputRef,
  getCurrentPlaybackBeat,
  isExportingMp3,
  isRecordingVoice,
  mediaRecorderRef,
  patternClipboardRef,
  project,
  projectRef,
  recordingChunksRef,
  recordingStartBeatRef,
  recordingStartMsRef,
  resetPlayback,
  resetProjectHistory,
  restoreProject,
  selectedTrack,
  setActiveEditorTab,
  setFileMenuOpen,
  setIsDraggingFile,
  setIsExportingMp3,
  setIsRecordingVoice,
  setProject,
  setSelectedNoteIds,
  snapBeatToGrid,
  totalBeats,
}: UseFileActionsOptions) {
  void audioFileInputRef
  void isRecordingVoice
  void mediaRecorderRef
  void recordingChunksRef
  void recordingStartBeatRef
  void recordingStartMsRef
  void selectedTrack
  void setIsRecordingVoice

  function createNewProject() {
    resetPlayback()
    setSelectedNoteIds([])
    patternClipboardRef.current = null
    resetProjectHistory()
    restoreProject(createInitialProject())
    setFileMenuOpen(false)
  }

  async function addAudioClipToTrack(trackId: string, blob: Blob, name: string, durationSeconds?: number, startBeatOverride?: number) {
    const dataUrl = await blobToDataUrl(blob)
    const resolvedDurationSeconds = durationSeconds ?? await getAudioDurationFromDataUrl(dataUrl)
    const startBeat = snapBeatToGrid(startBeatOverride ?? getCurrentPlaybackBeat())
    const clip = createAudioClip(
      projectRef.current,
      trackId,
      name,
      dataUrl,
      startBeat,
      totalBeats,
      resolvedDurationSeconds,
      await getAudioWaveform(blob),
    )

    setProject((current) => ({
      ...current,
      audioClips: [...(current.audioClips ?? []), clip],
    }))
  }

  async function addAudioFileAsTrack(file: File) {
    const trackId = createId('track')
    const name = file.name.replace(/\.[^.]+$/, '') || '오디오 파일'
    const dataUrl = await blobToDataUrl(file)
    const resolvedDurationSeconds = await getAudioDurationFromDataUrl(dataUrl)
    const waveform = await getAudioWaveform(file)
    const startBeat = snapBeatToGrid(getCurrentPlaybackBeat())
    const nextTrack: Track = createAudioTrack(projectRef.current, trackId, name)
    const clip = createAudioClip(projectRef.current, trackId, name, dataUrl, startBeat, totalBeats, resolvedDurationSeconds, waveform)

    setProject((current) => ({
      ...current,
      selectedTrackId: trackId,
      selectedNoteId: null,
      tracks: [...current.tracks, nextTrack],
      notesByTrack: { ...current.notesByTrack, [trackId]: [] },
      audioClips: [...(current.audioClips ?? []), clip],
    }))
    setSelectedNoteIds([])
    setActiveEditorTab('piano-roll')
  }

  function openAudioUpload() {
    return
  }

  async function importAudioFiles(event: ChangeEvent<HTMLInputElement>) {
    event.target.value = ''
    return
  }

  async function toggleVoiceRecording() {
    return
  }

  function saveProjectFile() {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${project.title || 'beginner-music'}.json`
    link.click()
    URL.revokeObjectURL(url)
    setFileMenuOpen(false)
  }

  function saveMidiFile() {
    if ((project.audioClips ?? []).length > 0) {
      alert('녹음이나 오디오 파일이 들어간 프로젝트는 MIDI로 저장할 수 없습니다. MP3 저장을 사용해 주세요.')
      setFileMenuOpen(false)
      return
    }

    const midiBytes = exportMidiProject(project)
    const blob = new Blob([midiBytes], { type: 'audio/midi' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${project.title || 'beginner-music'}.mid`
    link.click()
    URL.revokeObjectURL(url)
    setFileMenuOpen(false)
  }

  async function saveMp3File() {
    if (isExportingMp3) return

    setIsExportingMp3(true)
    setFileMenuOpen(false)
    try {
      const blob = await exportMp3Project(projectRef.current)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${projectRef.current.title || 'beginner-music'}.mp3`
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('음악 파일을 만들지 못했습니다. 음표가 너무 많거나 브라우저 오디오 만들기가 실패했을 수 있습니다.')
    } finally {
      setIsExportingMp3(false)
    }
  }

  function openProjectFile() {
    fileInputRef.current?.click()
    setFileMenuOpen(false)
  }

  function loadProjectFromFile(file: File) {
    const isMidi = file.name.toLowerCase().endsWith('.mid') || file.name.toLowerCase().endsWith('.midi')
    const reader = new FileReader()
    reader.onload = () => {
      try {
        resetPlayback()
        setSelectedNoteIds([])
        if (isMidi) {
          const buffer = reader.result
          if (!(buffer instanceof ArrayBuffer)) throw new Error('Invalid MIDI data')
          setProject(normalizeProject(importMidiProject(buffer, file.name.replace(/\.[^.]+$/, ''))))
        } else {
          const nextProject = normalizeProject(JSON.parse(String(reader.result)) as Project)
          setProject(nextProject)
        }
      } catch {
        alert('파일을 불러오지 못했습니다. BeginnerMusic 프로젝트 파일 또는 MIDI 파일인지 확인해 주세요.')
      }
    }

    if (isMidi) {
      reader.readAsArrayBuffer(file)
    } else {
      reader.readAsText(file)
    }
  }

  function loadProjectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    loadProjectFromFile(file)
    event.target.value = ''
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return
    event.preventDefault()
    setIsDraggingFile(true)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDraggingFile(false)
    const files = Array.from(event.dataTransfer.files)
    const projectFile = files.find((file) => /\.(json|beg|beginner-music|mid|midi)$/i.test(file.name))
    if (projectFile) {
      loadProjectFromFile(projectFile)
      return
    }
  }

  return {
    addAudioClipToTrack,
    addAudioFileAsTrack,
    createNewProject,
    handleDragOver,
    handleDrop,
    importAudioFiles,
    loadProjectFile,
    loadProjectFromFile,
    openAudioUpload,
    openProjectFile,
    saveMidiFile,
    saveMp3File,
    saveProjectFile,
    toggleVoiceRecording,
  }
}


