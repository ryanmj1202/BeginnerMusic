import { useState, type ComponentProps, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { ArrangeView } from './ArrangeView'
import { AutoMixPanel } from './AutoMixPanel'
import { DetailPanel } from './DetailPanel'
import { InstrumentDialog } from './InstrumentDialog'
import { PianoRollView } from './PianoRollView'
import { TempoPanel } from './TempoPanel'
import { TopMenu } from './TopMenu'
import { TrackPanel } from './TrackPanel'

type EditorLayoutProps = {
  activeEditorTab: 'arrange' | 'auto-mix' | 'piano-roll' | 'tempo'
  canRedo: boolean
  canUndo: boolean
  closePianoRollContextMenu: () => void
  closeTrackContextMenu: () => void
  contextMenuActions: {
    addTrack: () => void
    closeTrackContextMenu: () => void
    copySelectedNotes: () => void
    cutSelectedNotes: () => void
    cycleTrackColor: (trackId: string) => void
    deleteSelectedNote: () => void
    deleteTrack: (trackId: string) => void
    openTrackProperties: (trackId: string) => void
    pasteSelectedNotes: () => void
    redoProject: () => void
    undoProject: () => void
  }
  isAutoMixing: boolean
  isDraggingFile: boolean
  patternClipboardExists: boolean
  selectedPatternNoteCount: number
  projectTheme: 'dark' | 'light'
  toolMode: string
  topMenuProps: ComponentProps<typeof TopMenu>
  instrumentDialogProps: ComponentProps<typeof InstrumentDialog>
  trackPanelProps: ComponentProps<typeof TrackPanel>
  pianoRollProps: ComponentProps<typeof PianoRollView>
  arrangeViewProps: ComponentProps<typeof ArrangeView>
  autoMixPanelProps: ComponentProps<typeof AutoMixPanel>
  tempoPanelProps: ComponentProps<typeof TempoPanel>
  detailPanelProps: ComponentProps<typeof DetailPanel>
  trackContextMenu: { trackId: string; x: number; y: number } | null
  pianoRollContextMenu: { x: number; y: number } | null
  tracksCount: number
  onDragLeave: () => void
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void
}

export function EditorLayout({
  activeEditorTab,
  arrangeViewProps,
  autoMixPanelProps,
  canRedo,
  canUndo,
  closePianoRollContextMenu,
  closeTrackContextMenu,
  contextMenuActions,
  detailPanelProps,
  instrumentDialogProps,
  isAutoMixing,
  isDraggingFile,
  onDragLeave,
  onDragOver,
  onDrop,
  patternClipboardExists,
  selectedPatternNoteCount,
  pianoRollContextMenu,
  pianoRollProps,
  projectTheme,
  tempoPanelProps,
  toolMode,
  topMenuProps,
  trackContextMenu,
  trackPanelProps,
  tracksCount,
}: EditorLayoutProps) {
  const [trackPanelWidth, setTrackPanelWidth] = useState(240)
  const [detailPanelHeight, setDetailPanelHeight] = useState(180)
  const detailPanelLayoutHeight = detailPanelProps.detailPanelOpen ? detailPanelHeight : 88

  function beginTrackPanelResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault()
    const applyWidth = (clientX: number) => {
      setTrackPanelWidth(Math.max(180, Math.min(420, Math.round(clientX))))
    }
    applyWidth(event.clientX)
    const handlePointerMove = (moveEvent: PointerEvent) => {
      applyWidth(moveEvent.clientX)
    }
    const stop = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }

  function beginDetailPanelResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault()
    const applyHeight = (clientY: number) => {
      const height = window.innerHeight - clientY
      setDetailPanelHeight(Math.max(120, Math.min(360, Math.round(height))))
    }
    applyHeight(event.clientY)
    const handlePointerMove = (moveEvent: PointerEvent) => {
      applyHeight(moveEvent.clientY)
    }
    const stop = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }

  const editorShellStyle = {
    '--detail-panel-height': `${detailPanelLayoutHeight}px`,
    '--track-panel-width': `${trackPanelWidth}px`,
  } as CSSProperties

  return (
    <div
      className="app-shell"
      data-dragging-file={isDraggingFile}
      data-theme={projectTheme}
      data-tool={toolMode}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onPointerDown={() => {
        closeTrackContextMenu()
        closePianoRollContextMenu()
      }}
    >
      <TopMenu {...topMenuProps} />
      {isDraggingFile ? <div className="drop-overlay" aria-hidden="true">곡 파일, MIDI, 소리 파일을 놓으면 바로 불러옵니다.</div> : null}
      <InstrumentDialog {...instrumentDialogProps} />
      {isAutoMixing ? (
        <div className="busy-overlay" role="status" aria-live="polite">
          <strong>악기 균형 조정 중</strong>
          <span>악기별 음량, 좌우 위치, 울림을 맞추고 있습니다.</span>
        </div>
      ) : null}
      {trackContextMenu ? (
        <div className="track-context-menu" style={{ left: trackContextMenu.x, top: trackContextMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" onPointerDown={() => { contextMenuActions.addTrack(); contextMenuActions.closeTrackContextMenu() }}>악기 추가</button>
          <button type="button" disabled={tracksCount <= 1} onPointerDown={() => { contextMenuActions.deleteTrack(trackContextMenu.trackId); contextMenuActions.closeTrackContextMenu() }}>악기 삭제</button>
          <button type="button" onPointerDown={() => { contextMenuActions.openTrackProperties(trackContextMenu.trackId); contextMenuActions.closeTrackContextMenu() }}>악기 바꾸기</button>
          <button type="button" onPointerDown={() => { contextMenuActions.cycleTrackColor(trackContextMenu.trackId); contextMenuActions.closeTrackContextMenu() }}>색 바꾸기</button>
        </div>
      ) : null}
      {pianoRollContextMenu ? (
        <div className="track-context-menu piano-roll-context-menu" style={{ left: pianoRollContextMenu.x, top: pianoRollContextMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" disabled={!canUndo} onPointerDown={() => { contextMenuActions.undoProject(); closePianoRollContextMenu() }}>되돌리기</button>
          <button type="button" disabled={!canRedo} onPointerDown={() => { contextMenuActions.redoProject(); closePianoRollContextMenu() }}>다시 하기</button>
          <button type="button" disabled={selectedPatternNoteCount === 0} onPointerDown={() => { contextMenuActions.copySelectedNotes(); closePianoRollContextMenu() }}>복사</button>
          <button type="button" disabled={selectedPatternNoteCount === 0} onPointerDown={() => { contextMenuActions.cutSelectedNotes(); closePianoRollContextMenu() }}>자르기</button>
          <button type="button" disabled={!patternClipboardExists} onPointerDown={() => { contextMenuActions.pasteSelectedNotes(); closePianoRollContextMenu() }}>붙이기</button>
          <button type="button" disabled={selectedPatternNoteCount === 0} onPointerDown={() => { contextMenuActions.deleteSelectedNote(); closePianoRollContextMenu() }}>삭제</button>
        </div>
      ) : null}
      <main className="editor-shell" style={editorShellStyle}>
        <TrackPanel {...trackPanelProps} />
        <div
          className="panel-resizer panel-resizer-vertical"
          role="separator"
          aria-label="악기 목록 크기 조절"
          aria-orientation="vertical"
          onPointerDown={beginTrackPanelResize}
        />
        <section className="piano-roll-area" aria-label="멜로디 만들기">
          {activeEditorTab === 'piano-roll' ? (
            <PianoRollView {...pianoRollProps} />
          ) : null}
          {activeEditorTab === 'arrange' ? <ArrangeView {...arrangeViewProps} /> : null}
          {activeEditorTab === 'tempo' ? <TempoPanel {...tempoPanelProps} /> : null}
          {activeEditorTab === 'auto-mix' ? (
            <AutoMixPanel {...autoMixPanelProps} />
          ) : null}
        </section>
        <div
          className="panel-resizer panel-resizer-horizontal"
          role="separator"
          aria-label="?섎떒 李??믪씠 議곗젅"
          aria-orientation="horizontal"
          onPointerDown={beginDetailPanelResize}
        />
        <div className="bottom-panel-shell">
          <DetailPanel {...detailPanelProps} />
        </div>
      </main>
    </div>
  )
}

