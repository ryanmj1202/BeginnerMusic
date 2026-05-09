import { type ChangeEvent, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { EditorTab } from '../types'

type TopMenuProps = {
  activeEditorTab: EditorTab
  audioFileInputRef: RefObject<HTMLInputElement | null>
  canRedo: boolean
  canUndo: boolean
  copySelectedNotes: () => void
  createNewProject: () => void
  cutSelectedNotes: () => void
  duplicateSelectedNotes: () => void
  applyAutoMix: () => void
  editMenuOpen: boolean
  fileInputRef: RefObject<HTMLInputElement | null>
  fileMenuOpen: boolean
  hasPatternClipboard: boolean
  importAudioFiles: (event: ChangeEvent<HTMLInputElement>) => void
  isExportingMp3: boolean
  loadProjectFile: (event: ChangeEvent<HTMLInputElement>) => void
  openProjectFile: () => void
  pasteSelectedNotes: () => void
  projectTitle: string
  redoProject: () => void
  saveMidiFile: () => void
  saveMp3File: () => void
  saveProjectFile: () => void
  selectedPatternNoteCount: number
  setActiveEditorTab: Dispatch<SetStateAction<EditorTab>>
  setEditMenuOpen: Dispatch<SetStateAction<boolean>>
  setFileMenuOpen: Dispatch<SetStateAction<boolean>>
  undoProject: () => void
  updateProjectTitle: (title: string) => void
}

export function TopMenu({
  activeEditorTab,
  audioFileInputRef,
  canRedo,
  canUndo,
  copySelectedNotes,
  createNewProject,
  cutSelectedNotes,
  duplicateSelectedNotes,
  editMenuOpen,
  fileInputRef,
  fileMenuOpen,
  hasPatternClipboard,
  importAudioFiles,
  isExportingMp3,
  loadProjectFile,
  openProjectFile,
  pasteSelectedNotes,
  projectTitle,
  redoProject,
  saveMidiFile,
  saveMp3File,
  saveProjectFile,
  selectedPatternNoteCount,
  setActiveEditorTab,
  setEditMenuOpen,
  setFileMenuOpen,
  undoProject,
  updateProjectTitle,
}: TopMenuProps) {
  const closeUtilityMenus = () => {}

  return (
    <header className="top-bar">
      <nav className="main-menu" aria-label="메인 메뉴">
        <div className="file-menu-wrap">
          <button
            type="button"
            onPointerDown={(event) => {
              event.preventDefault()
              closeUtilityMenus()
              setEditMenuOpen(false)
              setFileMenuOpen((current) => !current)
            }}
          >
            <span>파일</span>
          </button>
          {fileMenuOpen ? (
            <div className="file-menu">
              <button type="button" onPointerDown={createNewProject}>새 파일</button>
              <button type="button" onPointerDown={openProjectFile}>열기</button>
              <button type="button" onPointerDown={saveProjectFile}>저장</button>
              <button type="button" disabled={isExportingMp3} onPointerDown={saveMp3File}>
                {isExportingMp3 ? '파일 내보내는 중...' : 'MP3로 내보내기'}
              </button>
              <button type="button" onPointerDown={saveMidiFile}>MIDI로 내보내기</button>
            </div>
          ) : null}
        </div>
        <div className="file-menu-wrap">
          <button
            type="button"
            onPointerDown={(event) => {
              event.preventDefault()
              closeUtilityMenus()
              setFileMenuOpen(false)
              setEditMenuOpen((current) => !current)
            }}
          >
            <span>편집</span>
          </button>
          {editMenuOpen ? (
            <div className="file-menu">
              <button type="button" disabled={!canUndo} onPointerDown={undoProject}>되돌리기</button>
              <button type="button" disabled={!canRedo} onPointerDown={redoProject}>다시 하기</button>
              <button type="button" disabled={selectedPatternNoteCount === 0} onPointerDown={copySelectedNotes}>복사</button>
              <button type="button" disabled={selectedPatternNoteCount === 0} onPointerDown={cutSelectedNotes}>잘라내기</button>
              <button type="button" disabled={!hasPatternClipboard} onPointerDown={pasteSelectedNotes}>붙여넣기</button>
              <button type="button" disabled={selectedPatternNoteCount === 0} onPointerDown={duplicateSelectedNotes}>복제</button>
            </div>
          ) : null}
        </div>
        <button type="button" className={activeEditorTab === 'piano-roll' ? 'is-active' : ''} onPointerDown={() => setActiveEditorTab('piano-roll')}>
          음악 편집창
        </button>
        <button type="button" className={activeEditorTab === 'auto-mix' ? 'is-active' : ''} onPointerDown={() => setActiveEditorTab('auto-mix')}>
          자동 균형 조정
        </button>
      </nav>

      <input
        aria-label="노래 이름"
        className="project-title-input"
        value={projectTitle}
        onChange={(event) => updateProjectTitle(event.target.value)}
      />

      <input
        ref={fileInputRef}
        className="hidden-file-input"
        type="file"
        accept="application/json,.json,.beginner-music.json,.mid,.midi,audio/midi"
        onChange={loadProjectFile}
      />
      <input
        ref={audioFileInputRef}
        className="hidden-file-input"
        type="file"
        accept="audio/*"
        multiple
        onChange={importAudioFiles}
      />
    </header>
  )
}

