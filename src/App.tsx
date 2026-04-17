import {
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import './App.css'
import {
  changePreviewNote,
  createInstrument,
  disposePreviewNote,
  ensureAudioReady,
  scheduleNotesInWindow,
  startPreviewNote,
  stopPreviewNote,
  type HeldPreview,
} from './lib/audio/toneTransport'
import {
  GENERAL_MIDI_INSTRUMENTS,
  getInstrumentIcon,
  getInstrumentImage,
  getInstrumentLabel,
} from './lib/midi/generalMidi'
import { importMidiProject } from './lib/midi/importMidi'
import type { InstrumentId, Note, Project, Track } from './types/music'

const STORAGE_KEY = 'beginner-music-project-v1'
const STEPS_PER_BEAT = 4
const DEFAULT_BARS = 16
const BEATS_PER_BAR = 4
const DEFAULT_DURATION_BEATS = 1
const MIN_DURATION_BEATS = 0.25
const KEY_COLUMN_WIDTH = 64
const ROLL_HEADER_HEIGHT = 32
const ROLL_ROW_HEIGHT = 32
const AUTO_SAVE_DELAY_MS = 500
const PLAYBACK_LOOKAHEAD_BEATS = 2
const PLAYBACK_SCHEDULER_MS = 180
const TEMPO_PRESETS = [60, 72, 80, 90, 100, 110, 120, 128, 140, 160, 180, 200]
const PLAYHEAD_SCROLL_PADDING = 160

const PITCHES = Array.from({ length: 36 }, (_, index) => 84 - index)
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const DRUM_INSTRUMENT = { family: 'Drums', icon: '◉', id: 'drums', label: 'Power Drum Kit', program: -1 }
const INSTRUMENT_OPTIONS = [DRUM_INSTRUMENT, ...GENERAL_MIDI_INSTRUMENTS]
const INSTRUMENT_CATEGORY_ORDER = [
  'Piano',
  'Chromatic',
  'Organ',
  'Guitar',
  'Bass',
  'Strings',
  'Ensemble',
  'Brass',
  'Reed',
  'Pipe',
  'Lead',
  'Pad',
  'FX',
  'Ethnic',
  'Percussive',
  'Sound FX',
  'Drums',
]
const INSTRUMENT_CATEGORY_LABELS: Record<string, string> = {
  Chromatic: 'Chromatic Percussion',
  Lead: 'Synth Lead',
  Pad: 'Synth Pad',
  FX: 'Synth FX',
}
const INSTRUMENT_CATEGORY_ICONS: Record<string, string> = {
  Piano: '▥',
  Chromatic: '◒',
  Organ: '▤',
  Guitar: '♮',
  Bass: '▰',
  Strings: '×',
  Ensemble: '▥',
  Brass: '◢',
  Reed: '♪',
  Pipe: '⌁',
  Lead: '◆',
  Pad: '◇',
  FX: '●',
  Ethnic: '◌',
  Percussive: '◉',
  'Sound FX': 'FX',
  Drums: 'DR',
}
const TRACK_COLORS = ['#5365d9', '#21a67a', '#d69b32', '#c95c8c', '#6a78f0', '#9b6bd3']

type PlaybackInstrument = ReturnType<typeof createInstrument>
type ToolMode = 'draw' | 'erase'

type NoteDrag = {
  active: boolean
  noteId: string
  trackId: string
  lastPitch: number | null
  lastStep: number | null
}

type TrackContextMenu = {
  trackId: string
  x: number
  y: number
} | null

type ActivePlaybackTrack = {
  id: string
  instrument: PlaybackInstrument
  notes: Note[]
  nextIndex: number
}

type InteractionHandlers = {
  eraseDraggedCellFromPointer: (clientX: number, clientY: number) => void
  eraseRightDraggedCellFromPointer: (clientX: number, clientY: number) => void
  moveDraggedNoteFromPointer: (clientX: number, clientY: number) => void
  stopHeldPreview: () => void
  togglePlayback: () => void
}

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

function getPitchName(pitch: number) {
  const octave = Math.floor(pitch / 12) - 1
  return `${NOTE_NAMES[pitch % 12]}${octave}`
}

function createInitialProject(): Project {
  const firstTrackId = createId('track')

  return {
    version: 1,
    id: createId('project'),
    title: '나의 첫 멜로디',
    tempo: 120,
    timeSignature: [4, 4],
    selectedTrackId: firstTrackId,
    selectedNoteId: null,
    theme: 'dark',
    tracks: [
      {
        id: firstTrackId,
        name: 'Track 1',
        instrumentId: 'gm-0',
        volume: 0.85,
        mute: false,
        color: TRACK_COLORS[0],
      },
    ],
    notesByTrack: {
      [firstTrackId]: [],
    },
  }
}

function normalizeProject(project: Project): Project {
  const fallbackTrackId = createId('track')
  const tracks = project.tracks?.length
    ? project.tracks.map((track, index) => ({
        ...track,
        mute: track.mute ?? false,
        color: track.color ?? TRACK_COLORS[index % TRACK_COLORS.length],
      }))
    : [
        {
          id: fallbackTrackId,
          name: 'Track 1',
          instrumentId: 'gm-0',
          volume: 0.85,
          mute: false,
          color: TRACK_COLORS[0],
        },
      ]
  const selectedTrackId = tracks.some((track) => track.id === project.selectedTrackId)
    ? project.selectedTrackId
    : tracks[0].id

  return {
    ...project,
    version: 1,
    title: project.title || '나의 첫 멜로디',
    tempo: project.tempo || 120,
    timeSignature: project.timeSignature ?? [4, 4],
    selectedTrackId,
    selectedNoteId: project.selectedNoteId ?? null,
    theme: 'dark',
    tracks,
    notesByTrack: {
      ...Object.fromEntries(tracks.map((track) => [track.id, []])),
      ...(project.notesByTrack ?? {}),
    },
  }
}

function readSavedProject() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? normalizeProject(JSON.parse(saved) as Project) : createInitialProject()
  } catch {
    return createInitialProject()
  }
}

function getNotesEndBeat(notesByTrack: Project['notesByTrack']) {
  return Object.values(notesByTrack)
    .flat()
    .reduce((endBeat, note) => Math.max(endBeat, note.startBeat + note.durationBeats), 0)
}

function isTextEditingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

function getInstrumentCategory(instrumentId: InstrumentId) {
  return INSTRUMENT_OPTIONS.find((instrument) => instrument.id === instrumentId)?.family ?? 'Piano'
}

function getCategoryLabel(category: string) {
  return INSTRUMENT_CATEGORY_LABELS[category] ?? category
}

function App() {
  const [project, setProject] = useState<Project>(() => readSavedProject())
  const [tempoInput, setTempoInput] = useState(() => String(project.tempo))
  const [resizingNoteId, setResizingNoteId] = useState<string | null>(null)
  const [instrumentMenuTrackId, setInstrumentMenuTrackId] = useState<string | null>(null)
  const [fileMenuOpen, setFileMenuOpen] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackBeat, setPlaybackBeat] = useState(0)
  const [toolMode, setToolMode] = useState<ToolMode>('draw')
  const [pressedPitch, setPressedPitch] = useState<number | null>(null)
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [instrumentCategory, setInstrumentCategory] = useState('Piano')
  const [pendingInstrumentId, setPendingInstrumentId] = useState<InstrumentId | null>(null)
  const [trackContextMenu, setTrackContextMenu] = useState<TrackContextMenu>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pianoRollRef = useRef<HTMLDivElement>(null)
  const projectRef = useRef(project)
  const activeInstrumentsRef = useRef<PlaybackInstrument[]>([])
  const activePlaybackTracksRef = useRef<ActivePlaybackTrack[]>([])
  const activeTimeoutsRef = useRef<number[]>([])
  const activeIntervalsRef = useRef<number[]>([])
  const playbackStartMsRef = useRef(0)
  const playbackStartBeatRef = useRef(0)
  const playbackBeatRef = useRef(0)
  const totalBeatsRef = useRef(0)
  const totalStepsRef = useRef(0)
  const heldPreviewRef = useRef<HeldPreview | null>(null)
  const previewTokenRef = useRef(0)
  const noteDragRef = useRef<NoteDrag | null>(null)
  const eraseRef = useRef({ active: false, lastKey: '' })
  const rightEraseRef = useRef({ active: false, lastKey: '' })
  const erasedNoteIdsRef = useRef(new Set<string>())
  const keyPreviewRef = useRef({ active: false })
  const interactionHandlersRef = useRef<InteractionHandlers>({
    eraseDraggedCellFromPointer: () => {},
    eraseRightDraggedCellFromPointer: () => {},
    moveDraggedNoteFromPointer: () => {},
    stopHeldPreview: () => {},
    togglePlayback: () => {},
  })

  const selectedTrack = useMemo(
    () => project.tracks.find((track) => track.id === project.selectedTrackId) ?? project.tracks[0],
    [project.selectedTrackId, project.tracks],
  )
  const selectedTrackNotes = useMemo(
    () => (selectedTrack ? project.notesByTrack[selectedTrack.id] ?? [] : []),
    [project.notesByTrack, selectedTrack],
  )
  const selectedNote = useMemo(
    () => selectedTrackNotes.find((note) => note.id === project.selectedNoteId) ?? null,
    [project.selectedNoteId, selectedTrackNotes],
  )
  const projectEndBeat = useMemo(() => getNotesEndBeat(project.notesByTrack), [project.notesByTrack])
  const visibleBars = Math.max(DEFAULT_BARS, Math.ceil(projectEndBeat / BEATS_PER_BAR))
  const totalBeats = visibleBars * BEATS_PER_BAR
  const totalSteps = totalBeats * STEPS_PER_BEAT
  const rollTimelineStyle = { gridTemplateColumns: `repeat(${visibleBars}, minmax(64px, 1fr))` }
  const rollShellStyle = {
    '--total-steps': totalSteps,
    gridTemplateColumns: `64px minmax(${totalSteps * 16}px, 1fr)`,
  } as CSSProperties
  const otherTrackNotes = useMemo(
    () =>
      project.tracks
        .filter((track) => track.id !== selectedTrack?.id)
        .flatMap((track) =>
          (project.notesByTrack[track.id] ?? []).map((note) => ({ ...note, trackId: track.id })),
        ),
    [project.notesByTrack, project.tracks, selectedTrack?.id],
  )
  const selectedNotesByPitch = useMemo(() => {
    const notesByPitch = new Map<number, Note[]>()
    selectedTrackNotes.forEach((note) => {
      const pitchNotes = notesByPitch.get(note.pitch) ?? []
      pitchNotes.push(note)
      notesByPitch.set(note.pitch, pitchNotes)
    })
    return notesByPitch
  }, [selectedTrackNotes])
  const otherNotesByPitch = useMemo(() => {
    const notesByPitch = new Map<number, Array<Note & { trackId: string }>>()
    otherTrackNotes.forEach((note) => {
      const pitchNotes = notesByPitch.get(note.pitch) ?? []
      pitchNotes.push(note)
      notesByPitch.set(note.pitch, pitchNotes)
    })
    return notesByPitch
  }, [otherTrackNotes])
  const instrumentDialogTrack =
    project.tracks.find((track) => track.id === instrumentMenuTrackId) ?? null
  const selectedInstrumentId =
    pendingInstrumentId ?? instrumentDialogTrack?.instrumentId ?? selectedTrack?.instrumentId ?? 'gm-0'
  const instrumentCategories = useMemo(
    () =>
      INSTRUMENT_CATEGORY_ORDER.filter((category) =>
        INSTRUMENT_OPTIONS.some((instrument) => instrument.family === category),
      ),
    [],
  )
  const categoryInstruments = useMemo(
    () => INSTRUMENT_OPTIONS.filter((instrument) => instrument.family === instrumentCategory),
    [instrumentCategory],
  )

  useEffect(() => {
    projectRef.current = project
    const saveTimeout = window.setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projectRef.current))
    }, AUTO_SAVE_DELAY_MS)

    return () => window.clearTimeout(saveTimeout)
  }, [project])

  useEffect(() => {
    playbackBeatRef.current = playbackBeat
    totalBeatsRef.current = totalBeats
    totalStepsRef.current = totalSteps
    pianoRollRef.current?.style.setProperty(
      '--playhead-left',
      `${Math.min(100, (playbackBeat / totalBeats) * 100)}%`,
    )
  }, [playbackBeat, totalBeats, totalSteps])

  useEffect(() => {
    setTempoInput(String(project.tempo))
  }, [project.tempo])

  interactionHandlersRef.current.togglePlayback = togglePlayback
  interactionHandlersRef.current.moveDraggedNoteFromPointer = moveDraggedNoteFromPointer
  interactionHandlersRef.current.eraseDraggedCellFromPointer = eraseDraggedCellFromPointer
  interactionHandlersRef.current.eraseRightDraggedCellFromPointer = eraseRightDraggedCellFromPointer
  interactionHandlersRef.current.stopHeldPreview = stopHeldPreview

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.code !== 'Space' || isTextEditingTarget(event.target)) return
      event.preventDefault()
      interactionHandlersRef.current.togglePlayback()
    }

    function handlePointerMove(event: PointerEvent) {
      interactionHandlersRef.current.moveDraggedNoteFromPointer(event.clientX, event.clientY)
      interactionHandlersRef.current.eraseDraggedCellFromPointer(event.clientX, event.clientY)
      if (rightEraseRef.current.active && (event.buttons & 2) !== 2) {
        rightEraseRef.current = { active: false, lastKey: '' }
        erasedNoteIdsRef.current = new Set()
        return
      }
      interactionHandlersRef.current.eraseRightDraggedCellFromPointer(event.clientX, event.clientY)
    }

    function clearPointerState() {
      noteDragRef.current = null
      eraseRef.current = { active: false, lastKey: '' }
      rightEraseRef.current = { active: false, lastKey: '' }
      erasedNoteIdsRef.current = new Set()
      keyPreviewRef.current.active = false
      setDraggingNoteId(null)
      interactionHandlersRef.current.stopHeldPreview()
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', clearPointerState)
    window.addEventListener('pointercancel', clearPointerState)
    window.addEventListener('contextmenu', clearPointerState)
    window.addEventListener('blur', clearPointerState)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', clearPointerState)
      window.removeEventListener('pointercancel', clearPointerState)
      window.removeEventListener('contextmenu', clearPointerState)
      window.removeEventListener('blur', clearPointerState)
    }
  }, [])

  useEffect(() => {
    if (!isPlaying) return

    let frameId = 0
    const tick = () => {
      const elapsedMs = performance.now() - playbackStartMsRef.current
      const elapsedBeat = elapsedMs / 1000 / (60 / projectRef.current.tempo)
      const currentBeat = Math.min(
        totalBeatsRef.current,
        playbackStartBeatRef.current + elapsedBeat,
      )
      playbackBeatRef.current = currentBeat
      pianoRollRef.current?.style.setProperty(
        '--playhead-left',
        `${Math.min(100, (currentBeat / totalBeatsRef.current) * 100)}%`,
      )
      const roll = pianoRollRef.current
      if (roll && totalBeatsRef.current > 0) {
        const gridWidth = Math.max(totalStepsRef.current * 16, roll.scrollWidth - KEY_COLUMN_WIDTH)
        const playheadX = KEY_COLUMN_WIDTH + (currentBeat / totalBeatsRef.current) * gridWidth
        const viewportLeft = roll.scrollLeft
        const viewportRight = viewportLeft + roll.clientWidth

        if (playheadX > viewportRight - PLAYHEAD_SCROLL_PADDING) {
          roll.scrollLeft = Math.min(
            roll.scrollWidth - roll.clientWidth,
            playheadX - roll.clientWidth + PLAYHEAD_SCROLL_PADDING,
          )
        } else if (playheadX < viewportLeft + KEY_COLUMN_WIDTH + PLAYHEAD_SCROLL_PADDING) {
          roll.scrollLeft = Math.max(0, playheadX - KEY_COLUMN_WIDTH - PLAYHEAD_SCROLL_PADDING)
        }
      }
      frameId = window.requestAnimationFrame(tick)
    }

    frameId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frameId)
  }, [isPlaying])

  function updateProjectTitle(title: string) {
    setProject((current) => (current.title === title ? current : { ...current, title }))
  }

  function updateTempo(tempo: number) {
    const nextTempo = Math.min(240, Math.max(20, Math.round(tempo)))
    setProject((current) => (current.tempo === nextTempo ? current : { ...current, tempo: nextTempo }))
    setTempoInput(String(nextTempo))
  }

  function commitTempoInput() {
    const parsedTempo = Number(tempoInput)
    if (Number.isFinite(parsedTempo)) {
      updateTempo(parsedTempo)
      return
    }

    setTempoInput(String(project.tempo))
  }

  function changeTempoInput(value: string) {
    setTempoInput(value)
    const parsedTempo = Number(value)
    if (!Number.isFinite(parsedTempo) || value.trim() === '') return
    updateTempo(parsedTempo)
  }

  function addTrack() {
    setProject((current) => {
      const trackId = createId('track')
      const nextTrack: Track = {
        id: trackId,
        name: `Track ${current.tracks.length + 1}`,
        instrumentId: 'gm-0',
        volume: 0.85,
        mute: false,
        color: TRACK_COLORS[current.tracks.length % TRACK_COLORS.length],
      }

      return {
        ...current,
        selectedTrackId: trackId,
        selectedNoteId: null,
        tracks: [...current.tracks, nextTrack],
        notesByTrack: { ...current.notesByTrack, [trackId]: [] },
      }
    })
  }

  function updateTrack(trackId: string, updates: Partial<Track>) {
    setProject((current) => {
      let changed = false
      const tracks = current.tracks.map((track) => {
        if (track.id !== trackId) return track

        const nextTrack = { ...track, ...updates }
        if (
          nextTrack.instrumentId !== track.instrumentId ||
          nextTrack.volume !== track.volume ||
          nextTrack.mute !== track.mute ||
          nextTrack.name !== track.name ||
          nextTrack.color !== track.color
        ) {
          changed = true
          return nextTrack
        }

        return track
      })

      return changed ? { ...current, tracks } : current
    })
  }

  function selectTrack(trackId: string) {
    setProject((current) =>
      current.selectedTrackId === trackId && current.selectedNoteId === null
        ? current
        : { ...current, selectedTrackId: trackId, selectedNoteId: null },
    )
  }

  function deleteTrack(trackId: string) {
    setProject((current) => {
      if (current.tracks.length <= 1) return current

      const nextTracks = current.tracks.filter((track) => track.id !== trackId)
      const nextNotesByTrack = Object.fromEntries(
        Object.entries(current.notesByTrack).filter(([notesTrackId]) => notesTrackId !== trackId),
      )
      const selectedTrackId =
        current.selectedTrackId === trackId ? nextTracks[0].id : current.selectedTrackId

      return {
        ...current,
        selectedTrackId,
        selectedNoteId: null,
        tracks: nextTracks,
        notesByTrack: nextNotesByTrack,
      }
    })
  }

  function cycleTrackColor(trackId: string) {
    setProject((current) => ({
      ...current,
      tracks: current.tracks.map((track) => {
        if (track.id !== trackId) return track

        const currentIndex = TRACK_COLORS.indexOf(track.color ?? TRACK_COLORS[0])
        return {
          ...track,
          color: TRACK_COLORS[(currentIndex + 1) % TRACK_COLORS.length],
        }
      }),
    }))
  }

  function selectInstrument(trackId: string, instrumentId: InstrumentId) {
    updateTrack(trackId, { instrumentId })
    setInstrumentMenuTrackId(null)
    setPendingInstrumentId(null)
  }

  function openInstrumentDialog(track: Track) {
    selectTrack(track.id)
    setInstrumentMenuTrackId(track.id)
    setPendingInstrumentId(track.instrumentId)
    setInstrumentCategory(getInstrumentCategory(track.instrumentId))
  }

  function closeInstrumentDialog() {
    setInstrumentMenuTrackId(null)
    setPendingInstrumentId(null)
  }

  function closeTrackContextMenu() {
    setTrackContextMenu(null)
  }

  function openTrackContextMenu(
    trackId: string,
    event: ReactPointerEvent<HTMLElement> | ReactMouseEvent<HTMLElement>,
  ) {
    event.preventDefault()
    event.stopPropagation()
    selectTrack(trackId)
    setTrackContextMenu({
      trackId,
      x: event.clientX,
      y: event.clientY,
    })
  }

  function confirmInstrumentDialog() {
    if (!instrumentDialogTrack || !pendingInstrumentId) {
      closeInstrumentDialog()
      return
    }

    selectInstrument(instrumentDialogTrack.id, pendingInstrumentId)
  }

  function stopHeldPreview() {
    previewTokenRef.current += 1
    stopPreviewNote(heldPreviewRef.current)
    heldPreviewRef.current = null
    setPressedPitch(null)
  }

  function startHeldPreview(pitch: number, velocity = 0.75) {
    if (!selectedTrack) return

    stopHeldPreview()
    setPressedPitch(pitch)
    const token = previewTokenRef.current
    void startPreviewNote(selectedTrack.instrumentId, pitch, velocity).then((preview) => {
      if (token !== previewTokenRef.current) {
        stopPreviewNote(preview)
        return
      }
      heldPreviewRef.current = preview
    })
  }

  function changeHeldPreviewPitch(pitch: number, velocity = 0.75) {
    if (!heldPreviewRef.current) {
      startHeldPreview(pitch, velocity)
      return
    }

    if (heldPreviewRef.current.pitch !== pitch) {
      previewTokenRef.current += 1
      disposePreviewNote(heldPreviewRef.current)
      heldPreviewRef.current = null
      setPressedPitch(pitch)
      const token = previewTokenRef.current
      void startPreviewNote(selectedTrack?.instrumentId ?? 'gm-0', pitch, velocity).then((preview) => {
        if (token !== previewTokenRef.current) {
          disposePreviewNote(preview)
          return
        }
        heldPreviewRef.current = preview
      })
      return
    }

    setPressedPitch(pitch)
    changePreviewNote(heldPreviewRef.current, pitch, velocity)
  }

  function beginKeyPreview(pitch: number, event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return

    event.preventDefault()
    keyPreviewRef.current.active = true
    startHeldPreview(pitch)
  }

  function continueKeyPreview(pitch: number) {
    if (!keyPreviewRef.current.active) return
    changeHeldPreviewPitch(pitch)
  }

  function getCellFromPointer(clientX: number, clientY: number) {
    const roll = pianoRollRef.current
    if (!roll) return null

    const rect = roll.getBoundingClientRect()
    const gridWidth = Math.max(totalSteps * 16, roll.clientWidth - KEY_COLUMN_WIDTH)
    const x = clientX - rect.left - KEY_COLUMN_WIDTH + roll.scrollLeft
    const y = clientY - rect.top - ROLL_HEADER_HEIGHT + roll.scrollTop
    const step = Math.floor((x / gridWidth) * totalSteps)
    const rowIndex = Math.floor(y / ROLL_ROW_HEIGHT)

    if (step < 0 || step >= totalSteps || rowIndex < 0 || rowIndex >= PITCHES.length) return null
    return { pitch: PITCHES[rowIndex], step }
  }

  function getStepFromRowPointer(row: HTMLElement, clientX: number) {
    const rect = row.getBoundingClientRect()
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width)
    return Math.min(totalSteps - 1, Math.max(0, Math.floor((x / rect.width) * totalSteps)))
  }

  function findNoteAtCell(trackId: string, pitch: number, step: number) {
    const beat = step / STEPS_PER_BEAT
    return (project.notesByTrack[trackId] ?? []).find(
      (note) =>
        note.pitch === pitch &&
        beat >= note.startBeat &&
        beat < note.startBeat + note.durationBeats,
    )
  }

  function moveNoteToCell(noteId: string, trackId: string, pitch: number, step: number) {
    const beat = step / STEPS_PER_BEAT

    setProject((current) => ({
      ...current,
      selectedNoteId: noteId,
      notesByTrack: {
        ...current.notesByTrack,
        [trackId]: (current.notesByTrack[trackId] ?? []).map((note) =>
          note.id === noteId
            ? {
                ...note,
                pitch,
                startBeat: Math.max(0, Math.min(totalBeats - note.durationBeats, beat)),
              }
            : note,
        ),
      },
    }))
  }

  function moveDraggedNoteToCell(pitch: number, step: number) {
    const drag = noteDragRef.current
    if (!drag?.active) return
    if (drag.lastPitch === pitch && drag.lastStep === step) return

    moveNoteToCell(drag.noteId, drag.trackId, pitch, step)
    if (drag.lastPitch !== pitch) {
      changeHeldPreviewPitch(pitch)
    }
    drag.lastPitch = pitch
    drag.lastStep = step
  }

  function moveDraggedNoteFromPointer(clientX: number, clientY: number) {
    const cell = getCellFromPointer(clientX, clientY)
    if (!cell || !noteDragRef.current?.active) return
    moveDraggedNoteToCell(cell.pitch, cell.step)
  }

  function eraseNoteAtCell(pitch: number, step: number) {
    const beat = step / STEPS_PER_BEAT
    const currentProject = projectRef.current
    const trackId = currentProject.selectedTrackId
    const noteToDelete = (currentProject.notesByTrack[trackId] ?? []).find(
      (note) =>
        note.pitch === pitch &&
        beat >= note.startBeat &&
        beat < note.startBeat + note.durationBeats,
    )

    if (!noteToDelete || erasedNoteIdsRef.current.has(noteToDelete.id)) return
    erasedNoteIdsRef.current.add(noteToDelete.id)

    setProject((current) => {
      const nextProject = {
        ...current,
        selectedNoteId: null,
        notesByTrack: {
          ...current.notesByTrack,
          [trackId]: (current.notesByTrack[trackId] ?? []).filter(
            (note) => note.id !== noteToDelete.id,
          ),
        },
      }
      projectRef.current = nextProject
      return nextProject
    })
  }

  function eraseNoteAtCellOnce(pitch: number, step: number, eraseState: { lastKey: string }) {
    const key = `${pitch}-${step}`
    if (eraseState.lastKey === key) return
    eraseState.lastKey = key
    eraseNoteAtCell(pitch, step)
  }

  function eraseDraggedCellFromPointer(clientX: number, clientY: number) {
    if (!eraseRef.current.active) return
    const cell = getCellFromPointer(clientX, clientY)
    if (!cell) return
    eraseNoteAtCellOnce(cell.pitch, cell.step, eraseRef.current)
  }

  function eraseRightDraggedCellFromPointer(clientX: number, clientY: number) {
    if (!rightEraseRef.current.active) return
    const cell = getCellFromPointer(clientX, clientY)
    if (!cell) return
    eraseNoteAtCellOnce(cell.pitch, cell.step, rightEraseRef.current)
  }

  function beginRightErase(pitch: number, step: number, event: ReactPointerEvent<HTMLElement>) {
    event.preventDefault()
    event.stopPropagation()
    rightEraseRef.current = { active: true, lastKey: '' }
    erasedNoteIdsRef.current = new Set()
    eraseNoteAtCellOnce(pitch, step, rightEraseRef.current)
  }

  function beginMoveNote(note: Note, event: ReactPointerEvent<HTMLButtonElement>) {
    if (!selectedTrack || event.button !== 0) return

    event.preventDefault()
    event.stopPropagation()
    if (toolMode === 'erase') {
      eraseRef.current = { active: true, lastKey: '' }
      erasedNoteIdsRef.current = new Set([note.id])
      deleteNote(note.id)
      return
    }

    setProject((current) => ({ ...current, selectedNoteId: note.id }))
    setDraggingNoteId(note.id)
    noteDragRef.current = {
      active: true,
      noteId: note.id,
      trackId: selectedTrack.id,
      lastPitch: note.pitch,
      lastStep: Math.round(note.startBeat * STEPS_PER_BEAT),
    }
    startHeldPreview(note.pitch, note.velocity)
  }

  function beginRightEraseNote(note: Note, event: ReactPointerEvent<HTMLButtonElement>) {
    if (!selectedTrack || event.button !== 2) return

    event.preventDefault()
    event.stopPropagation()
    rightEraseRef.current = { active: true, lastKey: '' }
    erasedNoteIdsRef.current = new Set([note.id])
    deleteNote(note.id)
  }

  function beginCellAction(pitch: number, step: number, event: ReactPointerEvent<HTMLElement>) {
    if (!selectedTrack) return

    if (event.button === 2) {
      beginRightErase(pitch, step, event)
      return
    }

    if (event.button !== 0) return

    event.preventDefault()
    if (toolMode === 'erase') {
      eraseRef.current = { active: true, lastKey: '' }
      erasedNoteIdsRef.current = new Set()
      eraseNoteAtCellOnce(pitch, step, eraseRef.current)
      return
    }

    const existingNote = findNoteAtCell(selectedTrack.id, pitch, step)
    if (existingNote) {
      setDraggingNoteId(existingNote.id)
      noteDragRef.current = {
        active: true,
        noteId: existingNote.id,
        trackId: selectedTrack.id,
        lastPitch: pitch,
        lastStep: step,
      }
      setProject((current) => ({ ...current, selectedNoteId: existingNote.id }))
      startHeldPreview(pitch, existingNote.velocity)
      return
    }

    const note: Note = {
      id: createId('note'),
      pitch,
      startBeat: step / STEPS_PER_BEAT,
      durationBeats: DEFAULT_DURATION_BEATS,
      velocity: 0.78,
    }

    noteDragRef.current = {
      active: true,
      noteId: note.id,
      trackId: selectedTrack.id,
      lastPitch: pitch,
      lastStep: step,
    }
    setDraggingNoteId(note.id)
    startHeldPreview(pitch, note.velocity)

    setProject((current) => ({
      ...current,
      selectedNoteId: note.id,
      notesByTrack: {
        ...current.notesByTrack,
        [selectedTrack.id]: [...(current.notesByTrack[selectedTrack.id] ?? []), note],
      },
    }))
  }

  function beginRowAction(pitch: number, event: ReactPointerEvent<HTMLDivElement>) {
    beginCellAction(pitch, getStepFromRowPointer(event.currentTarget, event.clientX), event)
  }

  function beginRowContextErase(pitch: number, event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault()
    const step = getStepFromRowPointer(event.currentTarget, event.clientX)
    rightEraseRef.current = { active: true, lastKey: '' }
    erasedNoteIdsRef.current = new Set()
    eraseNoteAtCellOnce(pitch, step, rightEraseRef.current)
  }

  function deleteSelectedNote() {
    if (!selectedTrack || !selectedNote) return
    deleteNote(selectedNote.id)
  }

  function deleteNote(noteId: string) {
    if (!selectedTrack) return

    setProject((current) => ({
      ...current,
      selectedNoteId: current.selectedNoteId === noteId ? null : current.selectedNoteId,
      notesByTrack: {
        ...current.notesByTrack,
        [selectedTrack.id]: (current.notesByTrack[selectedTrack.id] ?? []).filter(
          (note) => note.id !== noteId,
        ),
      },
    }))
  }

  function resizeNote(noteId: string, durationBeats: number) {
    if (!selectedTrack) return

    setProject((current) => ({
      ...current,
      selectedNoteId: noteId,
      notesByTrack: {
        ...current.notesByTrack,
        [selectedTrack.id]: (current.notesByTrack[selectedTrack.id] ?? []).map((note) =>
          note.id === noteId
            ? {
                ...note,
                durationBeats: Math.max(
                  MIN_DURATION_BEATS,
                  Math.min(totalBeats - note.startBeat, durationBeats),
                ),
              }
            : note,
        ),
      },
    }))
  }

  function startResizingNote(note: Note, event: ReactPointerEvent<HTMLSpanElement>) {
    const row = event.currentTarget.closest('.step-row')
    if (!(row instanceof HTMLElement)) return

    event.preventDefault()
    event.stopPropagation()
    setResizingNoteId(note.id)
    setProject((current) => ({ ...current, selectedNoteId: note.id }))

    const rowRect = row.getBoundingClientRect()

    function handlePointerMove(moveEvent: PointerEvent) {
      const x = Math.min(Math.max(moveEvent.clientX - rowRect.left, 0), rowRect.width)
      const step = Math.ceil((x / rowRect.width) * totalSteps)
      const endBeat = step / STEPS_PER_BEAT
      resizeNote(note.id, endBeat - note.startBeat)
    }

    function stopResizing() {
      setResizingNoteId(null)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopResizing)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopResizing)
  }

  function createNewProject() {
    resetPlayback()
    setProject(createInitialProject())
    setFileMenuOpen(false)
  }

  function saveProjectFile() {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${project.title || 'beginner-music'}.beginner-music.json`
    link.click()
    URL.revokeObjectURL(url)
    setFileMenuOpen(false)
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
        if (isMidi) {
          const buffer = reader.result
          if (!(buffer instanceof ArrayBuffer)) throw new Error('Invalid MIDI data')
          setProject(importMidiProject(buffer))
        } else {
          const nextProject = normalizeProject(JSON.parse(String(reader.result)) as Project)
          setProject(nextProject)
        }
      } catch {
        alert('파일을 불러오지 못했습니다. BeginnerMusic JSON 또는 MIDI 파일인지 확인해 주세요.')
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
    const file = event.dataTransfer.files[0]
    if (!file) return
    loadProjectFromFile(file)
  }

  function setPlaybackPosition(beat: number) {
    const nextBeat = Math.max(0, Math.min(totalBeats, beat))
    playbackBeatRef.current = nextBeat
    setPlaybackBeat(nextBeat)
    pianoRollRef.current?.style.setProperty(
      '--playhead-left',
      `${Math.min(100, (nextBeat / totalBeats) * 100)}%`,
    )
  }

  function keepPlayheadInView(beat: number) {
    const roll = pianoRollRef.current
    if (!roll || totalBeats <= 0) return

    const gridWidth = Math.max(totalSteps * 16, roll.scrollWidth - KEY_COLUMN_WIDTH)
    const playheadX = KEY_COLUMN_WIDTH + (beat / totalBeats) * gridWidth
    const viewportLeft = roll.scrollLeft
    const viewportRight = viewportLeft + roll.clientWidth
    const rightEdge = viewportRight - PLAYHEAD_SCROLL_PADDING
    const leftEdge = viewportLeft + KEY_COLUMN_WIDTH + PLAYHEAD_SCROLL_PADDING

    if (playheadX > rightEdge) {
      roll.scrollLeft = Math.min(
        roll.scrollWidth - roll.clientWidth,
        playheadX - roll.clientWidth + PLAYHEAD_SCROLL_PADDING,
      )
      return
    }

    if (playheadX < leftEdge) {
      roll.scrollLeft = Math.max(0, playheadX - KEY_COLUMN_WIDTH - PLAYHEAD_SCROLL_PADDING)
    }
  }

  function seekPlayback(beat: number) {
    setPlaybackPosition(beat)
    keepPlayheadInView(beat)
    if (isPlaying) {
      void startPlaybackAt(beat)
    }
  }

  function seekPlaybackFromTimeline(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return

    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width)
    seekPlayback((x / rect.width) * totalBeats)
  }

  function disposePlaybackVoices() {
    activeTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
    activeTimeoutsRef.current = []
    activeIntervalsRef.current.forEach((intervalId) => window.clearInterval(intervalId))
    activeIntervalsRef.current = []
    activeInstrumentsRef.current.forEach((instrument) => instrument.dispose())
    activeInstrumentsRef.current = []
    activePlaybackTracksRef.current = []
    setIsPlaying(false)
  }

  function schedulePlaybackWindow(currentBeat: number) {
    const windowEndBeat = currentBeat + PLAYBACK_LOOKAHEAD_BEATS

    activePlaybackTracksRef.current.forEach((track) => {
      const notesToSchedule: Note[] = []

      while (track.nextIndex < track.notes.length) {
        const note = track.notes[track.nextIndex]
        if (note.startBeat >= windowEndBeat) break

        if (note.startBeat + note.durationBeats > currentBeat) {
          notesToSchedule.push(note)
        }

        track.nextIndex += 1
      }

      if (notesToSchedule.length === 0) return

      scheduleNotesInWindow(
        track.instrument,
        notesToSchedule,
        projectRef.current.tempo,
        currentBeat,
        windowEndBeat,
      )
    })
  }

  function getLivePlaybackBeat() {
    const elapsedMs = performance.now() - playbackStartMsRef.current
    const elapsedBeat = elapsedMs / 1000 / (60 / projectRef.current.tempo)
    return Math.min(totalBeats, playbackStartBeatRef.current + elapsedBeat)
  }

  function getCurrentPlaybackBeat() {
    if (!isPlaying) return playbackBeatRef.current
    return getLivePlaybackBeat()
  }

  function pausePlayback() {
    const currentBeat = getCurrentPlaybackBeat()
    playbackBeatRef.current = currentBeat
    setPlaybackBeat(currentBeat)
    disposePlaybackVoices()
  }

  function resetPlayback() {
    disposePlaybackVoices()
    setPlaybackPosition(0)
  }

  async function startPlaybackAt(startBeat: number) {
    disposePlaybackVoices()
    await ensureAudioReady()

    const safeStartBeat = Math.max(0, Math.min(totalBeats, startBeat))
    const currentProject = projectRef.current

    currentProject.tracks.forEach((track) => {
      if (track.mute) return

      const notes = (currentProject.notesByTrack[track.id] ?? [])
        .map((note) => ({
          ...note,
          velocity: note.velocity * track.volume,
        }))
        .sort((left, right) => left.startBeat - right.startBeat)

      if (notes.length === 0) return

      const instrument = createInstrument(track.instrumentId)
      activeInstrumentsRef.current.push(instrument)
      activePlaybackTracksRef.current.push({
        id: track.id,
        instrument,
        notes,
        nextIndex: notes.findIndex((note) => note.startBeat + note.durationBeats > safeStartBeat),
      })
    })

    activePlaybackTracksRef.current.forEach((track) => {
      if (track.nextIndex < 0) track.nextIndex = track.notes.length
    })

    if (activePlaybackTracksRef.current.length === 0) {
      setPlaybackPosition(safeStartBeat)
      return
    }

    playbackStartBeatRef.current = safeStartBeat
    playbackStartMsRef.current = performance.now()
    setPlaybackPosition(safeStartBeat)
    setIsPlaying(true)
    schedulePlaybackWindow(safeStartBeat)
    activeIntervalsRef.current.push(
      window.setInterval(() => {
        schedulePlaybackWindow(getLivePlaybackBeat())
      }, PLAYBACK_SCHEDULER_MS),
    )
    activeTimeoutsRef.current.push(
      window.setTimeout(
        resetPlayback,
        Math.ceil(((totalBeats - safeStartBeat) * 60 * 1000) / currentProject.tempo) + 2200,
      ),
    )
  }

  async function startPlayback() {
    const startBeat = playbackBeatRef.current >= totalBeats ? 0 : playbackBeatRef.current
    await startPlaybackAt(startBeat)
  }

  function togglePlayback() {
    if (isPlaying) {
      pausePlayback()
      return
    }

    void startPlayback()
  }

  return (
    <div
      className="app-shell"
      data-dragging-file={isDraggingFile}
      data-theme={project.theme}
      data-tool={toolMode}
      onDragLeave={() => setIsDraggingFile(false)}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onPointerDown={closeTrackContextMenu}
    >
      <header className="top-bar">
        <nav className="main-menu" aria-label="상단 메뉴">
          <div className="file-menu-wrap">
            <button
              type="button"
              onPointerDown={(event) => {
                event.preventDefault()
                setFileMenuOpen((current) => !current)
              }}
            >
              File⌄
            </button>
            {fileMenuOpen ? (
              <div className="file-menu">
                <button type="button" onPointerDown={createNewProject}>New</button>
                <button type="button" onPointerDown={openProjectFile}>Open MIDI / Project</button>
                <button type="button" onPointerDown={saveProjectFile}>Save Project</button>
              </div>
            ) : null}
          </div>
          <button type="button" className="future-button" title="추후 편집 메뉴로 연결 예정">Edit</button>
          <button type="button" className="is-active">▥ Piano Roll</button>
          <button type="button" className="future-button" title="추후 편곡 화면으로 연결 예정">▤ Arrange</button>
          <button type="button" className="future-button" title="추후 템포 상세 편집으로 연결 예정">◷ Tempo</button>
        </nav>

        <input
          aria-label="프로젝트 이름"
          className="project-title-input"
          value={project.title}
          onChange={(event) => updateProjectTitle(event.target.value)}
        />

        <nav className="top-actions" aria-label="상단 작업">
          <button type="button" className="future-button" title="추후 설정 화면으로 연결 예정">Settings</button>
          <button type="button" className="future-button" title="추후 도움말로 연결 예정">Help</button>
          <button type="button" className="future-button" title="추후 로그인으로 연결 예정">Sign In</button>
        </nav>

        <input
          ref={fileInputRef}
          className="hidden-file-input"
          type="file"
          accept="application/json,.json,.beginner-music.json,.mid,.midi,audio/midi"
          onChange={loadProjectFile}
        />
      </header>

      {isDraggingFile ? (
        <div className="drop-overlay" aria-hidden="true">
          JSON 또는 MIDI 파일을 놓으면 바로 불러옵니다
        </div>
      ) : null}

      {instrumentDialogTrack ? (
        <div className="instrument-dialog-backdrop" onPointerDown={closeInstrumentDialog}>
          <section
            className="instrument-dialog"
            aria-label="악기 선택"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="instrument-picker-grid">
              <div className="instrument-column">
                <span className="instrument-column-title">Categories</span>
                <div className="instrument-category-list">
                  {instrumentCategories.map((category) => (
                    <button
                      type="button"
                      className={instrumentCategory === category ? 'is-active' : ''}
                      key={category}
                      onPointerDown={() => setInstrumentCategory(category)}
                    >
                      <span>{INSTRUMENT_CATEGORY_ICONS[category] ?? '•'}</span>
                      {getCategoryLabel(category)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="instrument-column">
                <span className="instrument-column-title">Instruments</span>
                <div className="instrument-choice-list">
                  {categoryInstruments.map((instrument) => (
                    <button
                      type="button"
                      className={selectedInstrumentId === instrument.id ? 'is-active' : ''}
                      key={instrument.id}
                      onPointerDown={() => setPendingInstrumentId(instrument.id)}
                    >
                      {instrument.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="instrument-dialog-footer">
              <label className="rhythm-toggle">
                <input
                  checked={selectedInstrumentId === 'drums'}
                  type="checkbox"
                  onChange={(event) => {
                    if (event.target.checked) {
                      setInstrumentCategory('Drums')
                      setPendingInstrumentId('drums')
                      return
                    }

                    setInstrumentCategory('Piano')
                    setPendingInstrumentId('gm-0')
                  }}
                />
                Rhythm Track
              </label>

              <div className="instrument-dialog-actions">
                <button type="button" onPointerDown={closeInstrumentDialog}>Cancel</button>
                <button type="button" className="primary-action" onPointerDown={confirmInstrumentDialog}>
                  OK
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {trackContextMenu ? (
        <div
          className="track-context-menu"
          style={{ left: trackContextMenu.x, top: trackContextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onPointerDown={() => {
              addTrack()
              closeTrackContextMenu()
            }}
          >
            트랙 추가
          </button>
          <button
            type="button"
            disabled={project.tracks.length <= 1}
            onPointerDown={() => {
              deleteTrack(trackContextMenu.trackId)
              closeTrackContextMenu()
            }}
          >
            트랙 삭제
          </button>
          <button
            type="button"
            onPointerDown={() => {
              const track = project.tracks.find((item) => item.id === trackContextMenu.trackId)
              if (track) openInstrumentDialog(track)
              closeTrackContextMenu()
            }}
          >
            속성
          </button>
          <button
            type="button"
            onPointerDown={() => {
              cycleTrackColor(trackContextMenu.trackId)
              closeTrackContextMenu()
            }}
          >
            트랙 색상 변경
          </button>
        </div>
      ) : null}

      <main className="editor-shell">
        <aside className="track-panel" aria-label="트랙 목록">
          <div className="track-toolbar">
            <button type="button" className="back-button">‹</button>
            <strong>{selectedTrack?.name ?? 'Track 1'}</strong>
            <button type="button" className="menu-button">☰</button>
          </div>

          <div className="track-list">
            {project.tracks.map((track, index) => (
              <article
                className={track.id === project.selectedTrackId ? 'track-item is-selected' : 'track-item'}
                key={track.id}
                onPointerDown={(event) => {
                  if (event.button !== 0) return
                  selectTrack(track.id)
                }}
                onContextMenu={(event) => openTrackContextMenu(track.id, event)}
                style={{ '--track-color': track.color ?? TRACK_COLORS[0] } as CSSProperties}
              >
                <button
                  type="button"
                  className="instrument-image"
                  aria-label={`${getInstrumentLabel(track.instrumentId)} 악기 변경`}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return
                    event.preventDefault()
                    event.stopPropagation()
                    openInstrumentDialog(track)
                  }}
                >
                  <img
                    alt=""
                    draggable={false}
                    src={getInstrumentImage(track.instrumentId)}
                  />
                </button>

                <div className="track-copy">
                  <strong>Track {index + 1}</strong>
                  <span>{getInstrumentLabel(track.instrumentId)}</span>
                </div>

                <div className="mini-actions" aria-label="트랙 제어">
                  <button
                    type="button"
                    title="미리듣기"
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    ⌕
                  </button>
                  <button
                    type="button"
                    className={track.mute ? 'is-muted' : ''}
                    title="음소거"
                    onPointerDown={(event) => {
                      event.stopPropagation()
                      updateTrack(track.id, { mute: !track.mute })
                    }}
                  >
                    {track.mute ? '×' : '♪'}
                  </button>
                  <button
                    type="button"
                    title="레이어"
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    ◆
                  </button>
                  <span>CH {index + 1}</span>
                </div>
              </article>
            ))}
          </div>

          <button type="button" className="add-track-button" onPointerDown={addTrack}>＋ Add Track</button>
        </aside>

        <section className="piano-roll-area" aria-label="피아노 롤">
          <div className="roll-header">
            <button
              type="button"
              className="instrument-pill"
              onPointerDown={(event) => {
                if (!selectedTrack || event.button !== 0) return
                event.preventDefault()
                openInstrumentDialog(selectedTrack)
              }}
            >
              {selectedTrack ? (
                <img
                  alt=""
                  draggable={false}
                  src={getInstrumentImage(selectedTrack.instrumentId)}
                />
              ) : (
                <span>{getInstrumentIcon('gm-0')}</span>
              )}
              {selectedTrack ? getInstrumentLabel(selectedTrack.instrumentId) : 'Piano'}
            </button>
            <div className="roll-tools">
              <button
                type="button"
                className={toolMode === 'draw' ? 'is-active' : ''}
                onPointerDown={() => setToolMode('draw')}
                title="그리기와 이동"
              >
                ✎
              </button>
              <button
                type="button"
                className={toolMode === 'erase' ? 'is-active' : ''}
                onPointerDown={() => setToolMode('erase')}
                title="드래그 삭제"
              >
                ⌫
              </button>
              <button type="button" className="future-button" title="추후 음표 도구">♪</button>
              <span>{visibleBars}</span>
            </div>
          </div>

          <div className="piano-roll" ref={pianoRollRef} style={rollShellStyle}>
            <div className="corner-cell"> </div>
            <div
              className="measure-row"
              style={rollTimelineStyle}
              onPointerDown={seekPlaybackFromTimeline}
            >
              <span className="timeline-seek-fill" aria-hidden="true" />
              <span className="timeline-seek-handle" aria-hidden="true" />
              {Array.from({ length: visibleBars }, (_, bar) => (
                <div className="measure-cell" key={bar}>
                  {bar + 1}
                </div>
              ))}
            </div>

            {PITCHES.map((pitch) => (
              <div className="roll-row" key={pitch}>
                <button
                  type="button"
                  className={`${NOTE_NAMES[pitch % 12].includes('#') ? 'piano-key is-black' : 'piano-key'}${
                    pressedPitch === pitch ? ' is-pressed' : ''
                  }`}
                  onPointerDown={(event) => {
                    beginKeyPreview(pitch, event)
                  }}
                  onPointerEnter={() => continueKeyPreview(pitch)}
                >
                  {getPitchName(pitch)}
                </button>
                <div
                  className="step-row"
                  onPointerDown={(event) => beginRowAction(pitch, event)}
                  onContextMenu={(event) => beginRowContextErase(pitch, event)}
                >
                  <span className="playhead" aria-hidden="true" />

                  {(otherNotesByPitch.get(pitch) ?? []).map((note) => (
                      <span
                        className="note-block is-ghost"
                        key={`${note.trackId}-${note.id}`}
                        style={{
                          left: `${(note.startBeat / totalBeats) * 100}%`,
                          width: `${(note.durationBeats / totalBeats) * 100}%`,
                        }}
                        aria-hidden="true"
                      />
                    ))}

                  {(selectedNotesByPitch.get(pitch) ?? []).map((note) => {
                      const className = [
                        'note-block',
                        note.id === project.selectedNoteId ? 'is-selected' : '',
                        draggingNoteId === note.id ? 'is-dragging' : '',
                        resizingNoteId === note.id ? 'is-resizing' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')

                      return (
                        <button
                          type="button"
                          className={className}
                          key={note.id}
                          style={{
                            left: `${(note.startBeat / totalBeats) * 100}%`,
                            width: `${(note.durationBeats / totalBeats) * 100}%`,
                          }}
                          onPointerDown={(event) => {
                            beginMoveNote(note, event)
                          }}
                          onPointerDownCapture={(event) => {
                            beginRightEraseNote(note, event)
                          }}
                          onContextMenu={(event) => {
                            event.preventDefault()
                          }}
                          aria-label={`${getPitchName(note.pitch)} 음표`}
                        >
                          <span
                            className="resize-handle"
                            onPointerDown={(event) => startResizingNote(note, event)}
                            aria-hidden="true"
                          />
                        </button>
                      )
                    })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="detail-panel" aria-label="세부 편집">
          <div className="detail-tabs" aria-label="편집 탭">
            <button className="is-active" type="button">Velocity</button>
            <button className="future-button" type="button">Pitch Bend</button>
            <button className="future-button" type="button">Volume</button>
            <button className="future-button" type="button">Panpot</button>
            <button className="future-button" type="button">Expression</button>
            <button className="future-button" type="button">Modulation</button>
          </div>

          <div className="velocity-lane">
            <div className="tempo-panel" aria-label="템포 설정">
              <span>BPM</span>
              <button type="button" onPointerDown={() => updateTempo(project.tempo - 5)}>−</button>
              <input
                aria-label="BPM"
                inputMode="numeric"
                type="text"
                value={tempoInput}
                onBlur={commitTempoInput}
                onChange={(event) => changeTempoInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur()
                  }
                }}
              />
              <select
                aria-label="템포 선택"
                value={TEMPO_PRESETS.includes(project.tempo) ? project.tempo : 'custom'}
                onChange={(event) => updateTempo(Number(event.target.value))}
              >
                <option disabled value="custom">직접</option>
                {TEMPO_PRESETS.map((tempo) => (
                  <option key={tempo} value={tempo}>
                    {tempo}
                  </option>
                ))}
              </select>
              <button type="button" onPointerDown={() => updateTempo(project.tempo + 5)}>＋</button>
            </div>

            {selectedTrackNotes.map((note) => (
              <button
                type="button"
                className={note.id === project.selectedNoteId ? 'velocity-bar is-selected' : 'velocity-bar'}
                key={note.id}
                style={{
                  left: `${(note.startBeat / totalBeats) * 100}%`,
                  height: `${Math.max(8, note.velocity * 100)}%`,
                }}
                onPointerDown={() => setProject((current) => ({ ...current, selectedNoteId: note.id }))}
                aria-label={`${getPitchName(note.pitch)} 소리 세기`}
              />
            ))}
          </div>

          <div className="transport-bar">
            <div className="transport-buttons">
              <button type="button" onPointerDown={resetPlayback}>■</button>
              <button type="button" onPointerDown={togglePlayback}>{isPlaying ? '⏸' : '▶'}</button>
              <span>Space 일시정지 / 이어재생</span>
            </div>

            <div className="selected-note-summary">
              {selectedNote ? `${getPitchName(selectedNote.pitch)} · 세기 ${Math.round(selectedNote.velocity * 100)}` : '음표 선택 없음'}
            </div>

            <button type="button" disabled={!selectedNote} onPointerDown={deleteSelectedNote}>Delete</button>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
