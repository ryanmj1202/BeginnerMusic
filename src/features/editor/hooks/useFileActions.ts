import type {
  ChangeEvent,
  Dispatch,
  DragEvent,
  MutableRefObject,
  SetStateAction,
} from 'react'
import { useEffect } from 'react'
import { exportMp3Project, exportWavProject } from '../../../lib/audio/exportMp3'
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
  useEffect(() => () => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    recorder?.stream.getTracks().forEach((track) => track.stop())
  }, [mediaRecorderRef])

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

  async function addAudioClipAsNewTrack(blob: Blob, name: string, durationSeconds?: number, startBeatOverride?: number) {
    const trackId = createId('track')
    const dataUrl = await blobToDataUrl(blob)
    const resolvedDurationSeconds = durationSeconds ?? await getAudioDurationFromDataUrl(dataUrl)
    const waveform = await getAudioWaveform(blob)
    const startBeat = snapBeatToGrid(startBeatOverride ?? getCurrentPlaybackBeat())
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

  async function addAudioFileAsTrack(file: File) {
    const name = file.name.replace(/\.[^.]+$/, '') || '오디오 파일'
    await addAudioClipAsNewTrack(file, name)
  }

  function openAudioUpload() {
    audioFileInputRef.current?.click()
  }

  async function importAudioFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith('audio/'))
    event.target.value = ''
    if (files.length === 0) return

    try {
      if (selectedTrack?.kind === 'audio' || selectedTrack?.instrumentId === 'audio-track') {
        for (const file of files) {
          await addAudioClipToTrack(selectedTrack.id, file, file.name.replace(/\.[^.]+$/, '') || '오디오 파일')
        }
      } else {
        for (const file of files) {
          await addAudioFileAsTrack(file)
        }
      }
    } catch {
      alert('오디오 파일을 불러오지 못했습니다. 지원되는 소리 파일인지 확인해 주세요.')
    }
  }

  async function toggleVoiceRecording() {
    if (isRecordingVoice) {
      mediaRecorderRef.current?.stop()
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      alert('이 브라우저에서는 마이크 녹음을 사용할 수 없습니다.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
      ].find((type) => MediaRecorder.isTypeSupported(type))
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)

      recordingChunksRef.current = []
      recordingStartBeatRef.current = getCurrentPlaybackBeat()
      recordingStartMsRef.current = performance.now()
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data)
      }
      recorder.onerror = () => {
        stream.getTracks().forEach((track) => track.stop())
        mediaRecorderRef.current = null
        recordingChunksRef.current = []
        setIsRecordingVoice(false)
        alert('녹음 중 오류가 발생했습니다.')
      }
      recorder.onstop = () => {
        const chunks = recordingChunksRef.current
        const durationSeconds = Math.max(0.1, (performance.now() - recordingStartMsRef.current) / 1000)
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        const startBeat = recordingStartBeatRef.current

        stream.getTracks().forEach((track) => track.stop())
        mediaRecorderRef.current = null
        recordingChunksRef.current = []
        setIsRecordingVoice(false)

        if (blob.size === 0) {
          alert('녹음된 소리가 없습니다.')
          return
        }

        const recordedAt = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        const name = `마이크 녹음 ${recordedAt}`
        const audioTrack = selectedTrack?.kind === 'audio' || selectedTrack?.instrumentId === 'audio-track'
          ? selectedTrack
          : null

        void (audioTrack
          ? addAudioClipToTrack(audioTrack.id, blob, name, durationSeconds, startBeat)
          : addAudioClipAsNewTrack(blob, name, durationSeconds, startBeat)
        ).catch(() => {
          alert('녹음 파일을 프로젝트에 추가하지 못했습니다.')
        })
      }

      recorder.start()
      setIsRecordingVoice(true)
    } catch (error) {
      setIsRecordingVoice(false)
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        alert('마이크 권한이 거부되었습니다. 브라우저 권한 설정을 확인해 주세요.')
        return
      }
      alert('마이크를 시작하지 못했습니다. 마이크 연결 상태를 확인해 주세요.')
    }
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

  function getSafeFileName(value: string) {
    return value.trim().replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ') || 'beginner-music'
  }

  const crcTable = (() => {
    const table = new Uint32Array(256)
    for (let index = 0; index < table.length; index += 1) {
      let value = index
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
      }
      table[index] = value >>> 0
    }
    return table
  })()

  function getCrc32(bytes: Uint8Array) {
    let crc = 0xffffffff
    for (let index = 0; index < bytes.length; index += 1) {
      crc = crcTable[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8)
    }
    return (crc ^ 0xffffffff) >>> 0
  }

  function writeUint16(output: number[], value: number) {
    output.push(value & 0xff, (value >>> 8) & 0xff)
  }

  function writeUint32(output: number[], value: number) {
    output.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff)
  }

  async function createZipBlob(files: Array<{ name: string; blob: Blob }>) {
    const encoder = new TextEncoder()
    const parts: BlobPart[] = []
    const centralDirectory: number[] = []
    let offset = 0
    const toBlobPart = (bytes: Uint8Array) => bytes.slice().buffer as ArrayBuffer
    const utf8FileNameFlag = 0x0800

    for (const file of files) {
      const nameBytes = encoder.encode(file.name)
      const data = new Uint8Array(await file.blob.arrayBuffer())
      const crc = getCrc32(data)
      const localHeader: number[] = []
      writeUint32(localHeader, 0x04034b50)
      writeUint16(localHeader, 20)
      writeUint16(localHeader, utf8FileNameFlag)
      writeUint16(localHeader, 0)
      writeUint16(localHeader, 0)
      writeUint16(localHeader, 0)
      writeUint32(localHeader, crc)
      writeUint32(localHeader, data.length)
      writeUint32(localHeader, data.length)
      writeUint16(localHeader, nameBytes.length)
      writeUint16(localHeader, 0)
      parts.push(toBlobPart(new Uint8Array(localHeader)), toBlobPart(nameBytes), toBlobPart(data))

      writeUint32(centralDirectory, 0x02014b50)
      writeUint16(centralDirectory, 20)
      writeUint16(centralDirectory, 20)
      writeUint16(centralDirectory, utf8FileNameFlag)
      writeUint16(centralDirectory, 0)
      writeUint16(centralDirectory, 0)
      writeUint16(centralDirectory, 0)
      writeUint32(centralDirectory, crc)
      writeUint32(centralDirectory, data.length)
      writeUint32(centralDirectory, data.length)
      writeUint16(centralDirectory, nameBytes.length)
      writeUint16(centralDirectory, 0)
      writeUint16(centralDirectory, 0)
      writeUint16(centralDirectory, 0)
      writeUint16(centralDirectory, 0)
      writeUint32(centralDirectory, 0)
      writeUint32(centralDirectory, offset)
      centralDirectory.push(...nameBytes)
      offset += localHeader.length + nameBytes.length + data.length
    }

    const centralDirectoryOffset = offset
    const centralDirectoryBytes = new Uint8Array(centralDirectory)
    const endRecord: number[] = []
    writeUint32(endRecord, 0x06054b50)
    writeUint16(endRecord, 0)
    writeUint16(endRecord, 0)
    writeUint16(endRecord, files.length)
    writeUint16(endRecord, files.length)
    writeUint32(endRecord, centralDirectoryBytes.length)
    writeUint32(endRecord, centralDirectoryOffset)
    writeUint16(endRecord, 0)

    return new Blob([...parts, toBlobPart(centralDirectoryBytes), toBlobPart(new Uint8Array(endRecord))], { type: 'application/zip' })
  }

  function downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
  }

  async function saveAudioFile(
    mode: 'mix' | 'tracks',
    extension: 'mp3' | 'wav',
    exportProject: (project: Project) => Promise<Blob>,
  ) {
    if (isExportingMp3) return

    setIsExportingMp3(true)
    setFileMenuOpen(false)
    try {
      const currentProject = projectRef.current
      const projectTitle = getSafeFileName(currentProject.title)
      if (mode === 'tracks') {
        const files = []
        for (const track of currentProject.tracks.filter((item) => !item.mute)) {
          files.push({
            name: `${projectTitle} - ${getSafeFileName(track.name)}.${extension}`,
            blob: await exportProject({
              ...currentProject,
              tracks: currentProject.tracks.map((item) => ({ ...item, mute: item.id !== track.id })),
            }),
          })
        }
        downloadBlob(await createZipBlob(files), `${projectTitle} - 개별 악기.zip`)
      } else {
        downloadBlob(await exportProject(currentProject), `${projectTitle}.${extension}`)
      }
    } catch {
      alert('음악 파일을 만들지 못했습니다. 음표가 너무 많거나 브라우저 오디오 만들기가 실패했을 수 있습니다.')
    } finally {
      setIsExportingMp3(false)
    }
  }

  function saveMp3File(mode: 'mix' | 'tracks' = 'mix') {
    void saveAudioFile(mode, 'mp3', exportMp3Project)
  }

  function saveWavFile(mode: 'mix' | 'tracks' = 'mix') {
    void saveAudioFile(mode, 'wav', exportWavProject)
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
    const audioFiles = files.filter((file) => file.type.startsWith('audio/'))
    if (audioFiles.length > 0) {
      void Promise.all(audioFiles.map((file) => addAudioFileAsTrack(file))).catch(() => {
        alert('오디오 파일을 불러오지 못했습니다. 지원되는 소리 파일인지 확인해 주세요.')
      })
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
    saveWavFile,
    toggleVoiceRecording,
  }
}


