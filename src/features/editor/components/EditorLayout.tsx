import type { ComponentProps } from 'react'
import { ArrangeView } from './ArrangeView'
import { AutoMixPanel } from './AutoMixPanel'
import { DetailPanel } from './DetailPanel'
import { InstrumentDialog } from './InstrumentDialog'
import { PianoRollView } from './PianoRollView'
import { TempoPanel } from './TempoPanel'
import { TopMenu } from './TopMenu'
import { TrackPanel } from './TrackPanel'

type EditorLayoutProps = {
  activeEditorTab: 'arrange' | 'automix' | 'piano-roll' | 'tempo'
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
  tempoPanelProps: ComponentProps<typeof TempoPanel>
  autoMixPanelProps: ComponentProps<typeof AutoMixPanel>
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
      {isDraggingFile ? <div className="drop-overlay" aria-hidden="true">프로젝트, MIDI, 오디오 파일을 놓으면 바로 불러옵니다</div> : null}
      {isAutoMixing ? <div className="busy-overlay" role="status" aria-live="polite"><strong>자동 믹스 중</strong><span>트랙 음량과 구간별 소리 세기를 맞추고 있습니다.</span></div> : null}
      <InstrumentDialog {...instrumentDialogProps} />
      {trackContextMenu ? (
        <div className="track-context-menu" style={{ left: trackContextMenu.x, top: trackContextMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" onPointerDown={() => { contextMenuActions.addTrack(); contextMenuActions.closeTrackContextMenu() }}>트랙 추가</button>
          <button type="button" disabled={tracksCount <= 1} onPointerDown={() => { contextMenuActions.deleteTrack(trackContextMenu.trackId); contextMenuActions.closeTrackContextMenu() }}>트랙 삭제</button>
          <button type="button" onPointerDown={() => { contextMenuActions.openTrackProperties(trackContextMenu.trackId); contextMenuActions.closeTrackContextMenu() }}>속성</button>
          <button type="button" onPointerDown={() => { contextMenuActions.cycleTrackColor(trackContextMenu.trackId); contextMenuActions.closeTrackContextMenu() }}>트랙 색상 변경</button>
        </div>
      ) : null}
      {pianoRollContextMenu ? (
        <div className="track-context-menu piano-roll-context-menu" style={{ left: pianoRollContextMenu.x, top: pianoRollContextMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" disabled={!canUndo} onPointerDown={() => { contextMenuActions.undoProject(); closePianoRollContextMenu() }}>실행 취소</button>
          <button type="button" disabled={!canRedo} onPointerDown={() => { contextMenuActions.redoProject(); closePianoRollContextMenu() }}>다시 실행</button>
          <button type="button" disabled={selectedPatternNoteCount === 0} onPointerDown={() => { contextMenuActions.copySelectedNotes(); closePianoRollContextMenu() }}>복사</button>
          <button type="button" disabled={selectedPatternNoteCount === 0} onPointerDown={() => { contextMenuActions.cutSelectedNotes(); closePianoRollContextMenu() }}>잘라내기</button>
          <button type="button" disabled={!patternClipboardExists} onPointerDown={() => { contextMenuActions.pasteSelectedNotes(); closePianoRollContextMenu() }}>붙여넣기</button>
          <button type="button" disabled={selectedPatternNoteCount === 0} onPointerDown={() => { contextMenuActions.deleteSelectedNote(); closePianoRollContextMenu() }}>삭제</button>
        </div>
      ) : null}
      <main className="editor-shell">
        <TrackPanel {...trackPanelProps} />
        <section className="piano-roll-area" aria-label="피아노 롤">
          {activeEditorTab === 'piano-roll' ? <PianoRollView {...pianoRollProps} /> : null}
          {activeEditorTab === 'arrange' ? <ArrangeView {...arrangeViewProps} /> : null}
          {activeEditorTab === 'tempo' ? <TempoPanel {...tempoPanelProps} /> : null}
          {activeEditorTab === 'automix' ? <AutoMixPanel {...autoMixPanelProps} /> : null}
        </section>
        <DetailPanel {...detailPanelProps} />
      </main>
    </div>
  )
}
