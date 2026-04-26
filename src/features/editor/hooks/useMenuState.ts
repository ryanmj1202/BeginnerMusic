import { useState } from 'react'
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import type { PianoRollContextMenu, TrackContextMenu } from '../types'

type OpenTrackContextMenuArgs = {
  event: ReactPointerEvent<HTMLElement> | ReactMouseEvent<HTMLElement>
  selectTrack: (trackId: string) => void
  trackId: string
}

type OpenPianoRollContextMenuArgs = {
  event: ReactMouseEvent<HTMLElement>
}

export function useMenuState() {
  const [fileMenuOpen, setFileMenuOpen] = useState(false)
  const [editMenuOpen, setEditMenuOpen] = useState(false)
  const [trackContextMenu, setTrackContextMenu] = useState<TrackContextMenu>(null)
  const [pianoRollContextMenu, setPianoRollContextMenu] = useState<PianoRollContextMenu>(null)

  function closeTrackContextMenu() {
    setTrackContextMenu(null)
  }

  function closePianoRollContextMenu() {
    setPianoRollContextMenu(null)
  }

  function openTrackContextMenu({ event, selectTrack, trackId }: OpenTrackContextMenuArgs) {
    event.preventDefault()
    event.stopPropagation()
    selectTrack(trackId)
    setTrackContextMenu({ trackId, x: event.clientX, y: event.clientY })
  }

  function openPianoRollContextMenu({ event }: OpenPianoRollContextMenuArgs) {
    event.preventDefault()
    event.stopPropagation()
    setPianoRollContextMenu({ x: event.clientX, y: event.clientY })
  }

  return {
    closePianoRollContextMenu,
    closeTrackContextMenu,
    editMenuOpen,
    fileMenuOpen,
    openPianoRollContextMenu,
    openTrackContextMenu,
    pianoRollContextMenu,
    setEditMenuOpen,
    setFileMenuOpen,
    setPianoRollContextMenu,
    setTrackContextMenu,
    trackContextMenu,
  }
}
