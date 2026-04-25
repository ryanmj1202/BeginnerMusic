# BeginnerMusic

BeginnerMusic는 초보자도 바로 멜로디를 만들 수 있게 설계한 브라우저 기반 음악 편집기입니다.  
현재 버전은 로컬 저장 기반이며, Firebase 없이 동작합니다.

## 현재 상태 (2026-04-25)

- 피아노 롤 편집, 편곡(Arrange), 템포 구간, AutoMix 탭이 동작합니다.
- JSON/MIDI 불러오기, JSON/MIDI/MP3 내보내기를 지원합니다.
- 오디오 파일 추가와 마이크 녹음을 지원합니다.
- 프로젝트 자동 저장(localStorage)과 Undo/Redo 히스토리를 지원합니다.

## 기술 스택

- React 19
- TypeScript
- Vite
- Tone.js
- lamejs (MP3 변환)

## 실행 방법

1. 의존성 설치

```bash
npm install
```

2. 개발 서버 실행

```bash
npm run dev
```

PowerShell 환경에서는 `npm` 대신 `npm.cmd` 사용을 권장합니다.

## 검증 명령

```bash
npm run lint
npm run build
```

## 주요 기능

- 피아노 롤에서 음표 입력, 이동, 리사이즈, 삭제
- 선택 박스/자유 선택(lasso), 복사/잘라내기/붙여넣기, 전체 선택
- 키보드 입력으로 실시간 음표 기록(`Keys` 토글)
- 트랙 추가/삭제, 트랙별 악기/볼륨/팬/뮤트/색상 관리
- 4개 편집 탭
- `Piano Roll`: 음표 상세 편집(세기, pitch bend, volume, pan, expression, modulation 포함)
- `Arrange`: 트랙 배치 블록 편집, 오디오 클립 배치, 웨이브폼 미리보기
- `Tempo`: 템포 구간 추가/수정/삭제 및 그래프 기반 편집
- `AutoMix`: 구간 컷과 중심 트랙 기반 자동 밸런스 조정
- 오디오 파일 드래그 앤 드롭 시 오디오 트랙 자동 생성
- 마이크 녹음 후 선택 트랙에 오디오 클립으로 삽입
- Space 재생/일시정지, 재생 헤드 이동, 자동 스크롤

## 파일 입출력

- 불러오기
- 프로젝트 JSON (`.json`, `.beg`, `.beginner-music`)
- MIDI (`.mid`, `.midi`)
- 오디오 파일(`audio/*`, 드래그 앤 드롭 또는 업로드)
- 내보내기
- 프로젝트 JSON
- MIDI (오디오 클립이 없을 때)
- MP3

## 저장 방식

- 작업 중 프로젝트는 `localStorage` 키 `beginner-music-project-v1`로 자동 저장됩니다.
- 브라우저 데이터를 지우면 자동 저장 데이터도 함께 사라집니다.

## 현재 소스 구조

```text
public/
  instrument-icons/
  note-icons/
  soundfonts/
src/
  App.tsx
  App.css
  features/
    editor/
      constants.ts
      helpers.ts
  lib/
    arrangement/
      trackArrangement.ts
    audio/
      exportMp3.ts
      sf2DrumKit.ts
      toneTransport.ts
    midi/
      exportMidi.ts
      generalMidi.ts
      importMidi.ts
  types/
    music.ts
```

## 참고

- 현재 프로젝트는 단일 메인 컴포넌트(`src/App.tsx`) 중심 구조입니다.
- 기능 분리 리팩터링은 `src/features/editor/*`로 단계적으로 진행 중입니다.
