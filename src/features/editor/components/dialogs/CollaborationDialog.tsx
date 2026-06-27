import { useEffect, useMemo, useState } from 'react'

type CollaborationToast = {
  id: number
  message: string
  tone: 'error' | 'success'
} | null

export type CollaborationDialogProps = {
  closeCollaborationDialog: () => void
  collaborationActive: boolean
  collaborationCode: string | null
  collaborationDialogOpen: boolean
  collaborationToast: CollaborationToast
  dismissCollaborationToast: () => void
  joinCollaborationRoom: (code: string) => void
  openCreateCollaborationRoom: () => void
  openJoinCollaborationRoom: () => void
  selectedCollaborationMode: 'create' | 'join' | null
  showCollaborationToast: (message: string, tone: 'error' | 'success') => void
}

function ClipboardIcon({ copied }: { copied: boolean }) {
  if (copied) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="8" width="11" height="13" rx="2" />
      <path d="M16 8V5a2 2 0 0 0-2-2H7A2 2 0 0 0 5 5v11a2 2 0 0 0 2 2h1" />
    </svg>
  )
}

function CollaborationToastView({
  collaborationToast,
  dismissCollaborationToast,
}: {
  collaborationToast: Exclude<CollaborationToast, null>
  dismissCollaborationToast: () => void
}) {
  return (
    <div className={`collaboration-toast is-${collaborationToast.tone}`} role="status" aria-live="polite">
      <span className="collaboration-toast-icon">{collaborationToast.tone === 'success' ? '✓' : '!'}</span>
      <span>{collaborationToast.message}</span>
      <button type="button" aria-label="알림 닫기" onPointerDown={dismissCollaborationToast}>
        <span aria-hidden="true" />
      </button>
    </div>
  )
}

export function CollaborationDialog({
  closeCollaborationDialog,
  collaborationActive,
  collaborationCode,
  collaborationDialogOpen,
  collaborationToast,
  dismissCollaborationToast,
  joinCollaborationRoom,
  openCreateCollaborationRoom,
  openJoinCollaborationRoom,
  selectedCollaborationMode,
  showCollaborationToast,
}: CollaborationDialogProps) {
  const [joinCode, setJoinCode] = useState('')
  const [copied, setCopied] = useState(false)
  const normalizedJoinCode = useMemo(() => joinCode.replace(/[^A-Z0-9]/g, '').slice(0, 5), [joinCode])

  useEffect(() => {
    if (!collaborationCode) setCopied(false)
  }, [collaborationCode])

  if (!collaborationDialogOpen) {
    return collaborationToast ? (
      <CollaborationToastView
        collaborationToast={collaborationToast}
        dismissCollaborationToast={dismissCollaborationToast}
      />
    ) : null
  }

  async function copyCollaborationCode() {
    if (!collaborationCode) return

    try {
      await navigator.clipboard.writeText(collaborationCode)
    } catch {
      const input = document.createElement('input')
      input.value = collaborationCode
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      input.remove()
    }

    setCopied(true)
    showCollaborationToast('클립보드에 복사했습니다.', 'success')
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <>
      <div className="instrument-dialog-backdrop" onPointerDown={closeCollaborationDialog}>
        <section
          className="instrument-dialog collaboration-dialog"
          aria-label="협업하기"
          onPointerDown={(event) => event.stopPropagation()}
        >
          {selectedCollaborationMode === 'create' && collaborationCode ? (
            <div className="collaboration-code-panel">
              <strong>참여 코드를 같이 작업할 친구에게 공유하세요.</strong>
              <span>참여 코드:</span>
              <div className="collaboration-code-box">
                <button type="button" aria-label="참여 코드 복사하기" onPointerDown={copyCollaborationCode}>
                  <ClipboardIcon copied={copied} />
                </button>
                <b>{collaborationCode}</b>
              </div>
            </div>
          ) : selectedCollaborationMode === 'join' ? (
            <div className="collaboration-join-panel">
              <strong>방 참여하기</strong>
              <input
                aria-label="참여 코드"
                maxLength={5}
                placeholder="BZ15G"
                value={normalizedJoinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              />
              <button type="button" onPointerDown={() => joinCollaborationRoom(normalizedJoinCode)}>
                참여하기
              </button>
            </div>
          ) : (
            <div className="collaboration-choice-grid">
              <button type="button" disabled={collaborationActive} onPointerDown={collaborationActive ? undefined : openCreateCollaborationRoom}>
                <span className="collaboration-choice-icon collaboration-choice-icon-people" aria-hidden="true">
                  <i />
                  <i />
                </span>
                <strong>{collaborationActive ? '협업 진행 중' : '방 생성하기'}</strong>
              </button>
              <button type="button" onPointerDown={openJoinCollaborationRoom}>
                <span className="collaboration-choice-icon collaboration-choice-icon-door" aria-hidden="true">
                  <i />
                </span>
                <strong>방 참여하기</strong>
              </button>
            </div>
          )}
        </section>
      </div>
      {collaborationToast ? (
        <CollaborationToastView
          collaborationToast={collaborationToast}
          dismissCollaborationToast={dismissCollaborationToast}
        />
      ) : null}
    </>
  )
}
