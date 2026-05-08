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
  AudioClip,
  Project,
  Track,
} from '../../../types/music'
import {
  MIN_DURATION_BEATS,
  TRACK_COLORS,
} from '../constants'
import {
  createId,
  createInitialProject,
  getTempoAtBeat,
  normalizeProject,
} from '../helpers'
import type {
  EditorTab,
  PatternClipboard,
} from '../types'

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

  function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('?뚯씪???쎌? 紐삵뻽?듬땲??'))
      reader.onload = () => resolve(String(reader.result))
      reader.readAsDataURL(blob)
    })
  }

  function getAudioDurationFromDataUrl(dataUrl: string) {
    return new Promise<number>((resolve) => {
      const audio = new Audio()
      audio.preload = 'metadata'
      audio.onloadedmetadata = () => {
        resolve(Number.isFinite(audio.duration) ? audio.duration : 1)
      }
      audio.onerror = () => resolve(1)
      audio.src = dataUrl
    })
  }

  async function getAudioWaveform(blob: Blob, bars = 96) {
    try {
      const arrayBuffer = await blob.arrayBuffer()
      const context = new AudioContext()
      const buffer = await context.decodeAudioData(arrayBuffer.slice(0))
      const channel = buffer.getChannelData(0)
      const samplesPerBar = Math.max(1, Math.floor(channel.length / bars))
      const waveform = Array.from({ length: bars }, (_, barIndex) => {
        const start = barIndex * samplesPerBar
        const end = Math.min(channel.length, start + samplesPerBar)
        let peak = 0
        for (let index = start; index < end; index += 1) {
          peak = Math.max(peak, Math.abs(channel[index]))
        }
        return Math.round(Math.min(1, peak) * 100) / 100
      })
      await context.close()
      return waveform
    } catch {
      return Array.from({ length: bars }, (_, index) => 0.24 + Math.sin(index * 0.31) * 0.14)
    }
  }

  async function addAudioClipToTrack(trackId: string, blob: Blob, name: string, durationSeconds?: number, startBeatOverride?: number) {
    const dataUrl = await blobToDataUrl(blob)
    const resolvedDurationSeconds = durationSeconds ?? await getAudioDurationFromDataUrl(dataUrl)
    const startBeat = snapBeatToGrid(startBeatOverride ?? getCurrentPlaybackBeat())
    const tempoAtStart = getTempoAtBeat(projectRef.current, startBeat, totalBeats)
    const durationBeats = Math.max(MIN_DURATION_BEATS, resolvedDurationSeconds / (60 / tempoAtStart))
    const clip: AudioClip = {
      id: createId('audio'),
      trackId,
      name,
      dataUrl,
      startBeat,
      durationBeats,
      volume: 1,
      pan: 0,
      waveform: await getAudioWaveform(blob),
    }

    setProject((current) => ({
      ...current,
      audioClips: [...(current.audioClips ?? []), clip],
    }))
  }

  async function addAudioFileAsTrack(file: File) {
    const trackId = createId('track')
    const name = file.name.replace(/\.[^.]+$/, '') || '?ㅻ뵒???뚯씪'
    const dataUrl = await blobToDataUrl(file)
    const resolvedDurationSeconds = await getAudioDurationFromDataUrl(dataUrl)
    const waveform = await getAudioWaveform(file)
    const startBeat = snapBeatToGrid(getCurrentPlaybackBeat())
    const tempoAtStart = getTempoAtBeat(projectRef.current, startBeat, totalBeats)
    const durationBeats = Math.max(MIN_DURATION_BEATS, resolvedDurationSeconds / (60 / tempoAtStart))
    const nextTrack: Track = {
      id: trackId,
      name,
      instrumentId: 'audio-track',
      kind: 'audio',
      volume: 0.95,
      pan: 0,
      mute: false,
      solo: false,
      channel: Math.min(16, projectRef.current.tracks.length + 1),
      color: TRACK_COLORS[projectRef.current.tracks.length % TRACK_COLORS.length],
    }
    const clip: AudioClip = {
      id: createId('audio'),
      trackId,
      name,
      dataUrl,
      startBeat,
      durationBeats,
      volume: 1,
      pan: 0,
      waveform,
    }

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
      alert('?뱀쓬?대굹 ?ㅻ뵒???뚯씪???ㅼ뼱媛??꾨줈?앺듃??MIDI濡???ν븷 ???놁뒿?덈떎. MP3 ??μ쓣 ?ъ슜??二쇱꽭??')
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
      alert('?뚯븙 ?뚯씪??留뚮뱾吏 紐삵뻽?듬땲?? ?뚰몴媛 ?덈Т 留롪굅??釉뚮씪?곗? ?ㅻ뵒??留뚮뱾湲곌? ?ㅽ뙣?덉쓣 ???덉뒿?덈떎.')
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
        alert('?뚯씪??遺덈윭?ㅼ? 紐삵뻽?듬땲?? 鍮꾧린?덈?吏??꾨줈?앺듃 ?뚯씪 ?먮뒗 誘몃뵒 ?뚯씪?몄? ?뺤씤??二쇱꽭??')
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


