import type {
  ChangeEvent,
  Dispatch,
  RefObject,
  SetStateAction,
} from 'react'
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
  setAutoMixPanelOpen: Dispatch<SetStateAction<boolean>>
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
  setAutoMixPanelOpen,
  setEditMenuOpen,
  setFileMenuOpen,
  undoProject,
  updateProjectTitle,
}: TopMenuProps) {
  return (
    <header className="top-bar">
      <nav className="main-menu" aria-label="상단 메뉴">
        <div className="file-menu-wrap">
          <button
            type="button"
            onPointerDown={(event) => {
              event.preventDefault()
              setEditMenuOpen(false)
              setFileMenuOpen((current) => !current)
            }}
          >
            <span>파일</span>
          </button>
          {fileMenuOpen ? (
            <div className="file-menu">
              <button type="button" onPointerDown={createNewProject}>새 프로젝트</button>
              <button type="button" onPointerDown={openProjectFile}>불러오기</button>
              <button type="button" onPointerDown={saveProjectFile}>프로젝트 저장</button>
              <button type="button" disabled={isExportingMp3} onPointerDown={saveMp3File}>
                {isExportingMp3 ? '음악 파일 만드는 중...' : '음악 파일 저장'}
              </button>
              <button type="button" onPointerDown={saveMidiFile}>미디 파일 저장</button>
            </div>
          ) : null}
        </div>
        <div className="file-menu-wrap">
          <button
            type="button"
            onPointerDown={(event) => {
              event.preventDefault()
              setFileMenuOpen(false)
              setEditMenuOpen((current) => !current)
            }}
          >
            <span>편집</span>
          </button>
          {editMenuOpen ? (
            <div className="file-menu">
              <button type="button" disabled={!canUndo} onPointerDown={undoProject}>
                되돌리기
              </button>
              <button type="button" disabled={!canRedo} onPointerDown={redoProject}>
                다시 실행
              </button>
              <button type="button" disabled={selectedPatternNoteCount === 0} onPointerDown={copySelectedNotes}>
                복사
              </button>
              <button type="button" disabled={selectedPatternNoteCount === 0} onPointerDown={cutSelectedNotes}>
                잘라내기
              </button>
              <button type="button" disabled={!hasPatternClipboard} onPointerDown={pasteSelectedNotes}>
                붙여넣기
              </button>
              <button type="button" disabled={selectedPatternNoteCount === 0} onPointerDown={duplicateSelectedNotes}>
                복제
              </button>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className={activeEditorTab === 'piano-roll' ? 'is-active' : ''}
          onPointerDown={() => setActiveEditorTab('piano-roll')}
        >
          ▥ 멜로디 입력
        </button>
        <button
          type="button"
          className={activeEditorTab === 'arrange' ? 'is-active' : ''}
          onPointerDown={() => setActiveEditorTab('arrange')}
        >
          ▤ 배치
        </button>
        <button
          type="button"
          className={activeEditorTab === 'tempo' ? 'is-active' : ''}
          onPointerDown={() => setActiveEditorTab('tempo')}
        >
          ◷ 빠르기
        </button>
        <button
          type="button"
          className={activeEditorTab === 'automix' ? 'is-active' : ''}
          onPointerDown={() => {
            setActiveEditorTab('automix')
            setAutoMixPanelOpen(true)
          }}
        >
          ⧉ 믹스 우선순위
        </button>
      </nav>

      <input
        aria-label="프로젝트 이름"
        className="project-title-input"
        value={projectTitle}
        onChange={(event) => updateProjectTitle(event.target.value)}
      />

      <nav className="top-actions" aria-label="상단 작업">
        <button type="button" className="future-button" title="추후 설정 화면으로 연결 예정">설정</button>
        <button type="button" className="future-button" title="추후 도움말로 연결 예정">도움말</button>
        <button type="button" className="future-button" title="추후 로그인으로 연결 예정">로그인</button>
      </nav>

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
