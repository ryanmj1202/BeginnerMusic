import { useMemo, useState, type ChangeEvent, type Dispatch, type RefObject, type SetStateAction } from 'react'
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

type HelpTopic = 'basics' | 'pitch-bend' | 'volume'

export function TopMenu({
  activeEditorTab,
  audioFileInputRef,
  canRedo,
  canUndo,
  copySelectedNotes,
  createNewProject,
  cutSelectedNotes,
  duplicateSelectedNotes,
  applyAutoMix,
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
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false)
  const [helpMenuOpen, setHelpMenuOpen] = useState(false)
  const [loginMenuOpen, setLoginMenuOpen] = useState(false)
  const [helpTopic, setHelpTopic] = useState<HelpTopic>('basics')
  const [loginInput, setLoginInput] = useState('')
  const [signedInAs, setSignedInAs] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem('beginner-music-user')
  })

  const quickGuide = useMemo(() => {
    if (helpTopic === 'pitch-bend') {
      return [
        '음정 곡선을 직접 드래그해 휘는 소리를 그립니다.',
        '오른쪽 값이 0이면 원래 음정입니다.',
        '완만한 기울기는 부드럽고, 급한 기울기는 날카롭게 들립니다.',
      ]
    }
    if (helpTopic === 'volume') {
      return [
        '선이 높을수록 크게, 낮을수록 작게 재생됩니다.',
        '피크를 낮추면 클리핑을 줄일 수 있습니다.',
        '여러 음표를 함께 편집하면 균형을 맞추기 쉽습니다.',
      ]
    }
    return [
      '노트를 클릭해 선택하고 드래그로 이동·길이 조절을 합니다.',
      '상세 그래프에서 음량과 음정을 조절할 수 있습니다.',
      '패널 경계를 드래그해 작업 영역 크기를 조절합니다.',
    ]
  }, [helpTopic])

  const closeUtilityMenus = () => {
    setSettingsMenuOpen(false)
    setHelpMenuOpen(false)
    setLoginMenuOpen(false)
  }

  const signIn = () => {
    const nextName = loginInput.trim()
    if (!nextName) return
    setSignedInAs(nextName)
    window.localStorage.setItem('beginner-music-user', nextName)
    setLoginInput('')
  }

  const signOut = () => {
    setSignedInAs(null)
    window.localStorage.removeItem('beginner-music-user')
  }

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
              <button type="button" onPointerDown={createNewProject}>새 곡 만들기</button>
              <button type="button" onPointerDown={openProjectFile}>열기</button>
              <button type="button" onPointerDown={saveProjectFile}>저장</button>
              <button type="button" disabled={isExportingMp3} onPointerDown={saveMp3File}>
                {isExportingMp3 ? '소리 파일 저장 중...' : '소리 파일로 저장'}
              </button>
              <button type="button" onPointerDown={saveMidiFile}>MIDI로 저장</button>
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
          멜로디 만들기
        </button>
        <button type="button" className={activeEditorTab === 'auto-mix' ? 'is-active' : ''} onPointerDown={() => setActiveEditorTab('auto-mix')}>
          악기 균형 조정
        </button>
      </nav>

      <input
        aria-label="곡 제목"
        className="project-title-input"
        value={projectTitle}
        onChange={(event) => updateProjectTitle(event.target.value)}
      />

      <nav className="top-actions" aria-label="상단 작업">
        <div className="utility-menu-wrap">
          <button
            type="button"
            onPointerDown={(event) => {
              event.preventDefault()
              setFileMenuOpen(false)
              setEditMenuOpen(false)
              setHelpMenuOpen(false)
              setLoginMenuOpen(false)
              setSettingsMenuOpen((current) => !current)
            }}
          >
            설정
          </button>
          {settingsMenuOpen ? (
            <div className="utility-menu">
              <button
                type="button"
                onPointerDown={() => {
                  applyAutoMix()
                  setSettingsMenuOpen(false)
                }}
              >
                악기 균형 조정
              </button>
              <button type="button" onPointerDown={() => setActiveEditorTab('piano-roll')}>멜로디 만들기 열기</button>
            </div>
          ) : null}
        </div>
        <div className="utility-menu-wrap">
          <button
            type="button"
            onPointerDown={(event) => {
              event.preventDefault()
              setFileMenuOpen(false)
              setEditMenuOpen(false)
              setSettingsMenuOpen(false)
              setLoginMenuOpen(false)
              setHelpMenuOpen((current) => !current)
            }}
          >
            도움말
          </button>
          {helpMenuOpen ? (
            <div className="utility-menu utility-menu-help">
              <div className="help-topic-tabs">
                <button type="button" className={helpTopic === 'basics' ? 'is-active' : ''} onPointerDown={() => setHelpTopic('basics')}>기본</button>
                <button type="button" className={helpTopic === 'volume' ? 'is-active' : ''} onPointerDown={() => setHelpTopic('volume')}>음량</button>
                <button type="button" className={helpTopic === 'pitch-bend' ? 'is-active' : ''} onPointerDown={() => setHelpTopic('pitch-bend')}>음정 휘기</button>
              </div>
              <ul className="help-list">
                {quickGuide.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <div className="utility-menu-wrap">
          <button
            type="button"
            onPointerDown={(event) => {
              event.preventDefault()
              setFileMenuOpen(false)
              setEditMenuOpen(false)
              setSettingsMenuOpen(false)
              setHelpMenuOpen(false)
              setLoginMenuOpen((current) => !current)
            }}
          >
            {signedInAs ? '계정' : '로그인'}
          </button>
          {loginMenuOpen ? (
            <div className="utility-menu utility-menu-login">
              {signedInAs ? (
                <>
                  <strong>{signedInAs}</strong>
                  <span>이 기기에서 로그인됨</span>
                  <button type="button" onPointerDown={signOut}>로그아웃</button>
                </>
              ) : (
                <>
                  <input
                    aria-label="닉네임"
                    value={loginInput}
                    placeholder="닉네임 입력"
                    onChange={(event) => setLoginInput(event.target.value)}
                  />
                  <button type="button" onPointerDown={signIn}>로그인</button>
                </>
              )}
            </div>
          ) : null}
        </div>
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

