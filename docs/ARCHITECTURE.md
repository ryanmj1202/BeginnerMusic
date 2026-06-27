# BeginnerMusic 파일 아키텍처 정리

이 문서는 현재 프로젝트를 기능 기준으로 나눈 구조와 각 영역의 역할을 정리한 것이다. 한국어 UI 문구와 기존 기능은 유지하는 것을 기준으로 정리했다.

## 전체 구조

```text
src/
  App.tsx                         앱 진입 컴포넌트 연결
  main.tsx                        React 렌더링 시작점
  index.css                       전역 CSS 진입점
  styles/                         화면 전체 스타일 파일
  types/                          음악 프로젝트 공통 타입
  lib/
    arrangement/                  편곡/배치 계산
    audio/                        Tone.js, 미리듣기, 재생, 오디오 내보내기
    midi/                         MIDI/General MIDI 변환, 가져오기, 내보내기
    workstationLoop.ts            워크스테이션 반복 구간 계산
  features/
    editor/                       작곡 편집기 핵심 기능
```

## `features/editor`

```text
features/editor/
  EditorApp.tsx                   편집기 앱 진입점
  EditorWorkspace.tsx             편집기 전체 상태 연결부
  constants.ts                    편집기 상수
  helpers.ts                      편집기 계산 보조 함수
  types.ts                        편집기 전용 타입
  components/                     화면 컴포넌트
  hooks/                          상태/동작 훅
  utils/                          순수 계산/변환 유틸
```

### 컴포넌트 구조

```text
components/
  layout/
    EditorLayout.tsx              편집기 전체 배치
    TopMenu.tsx                   상단 메뉴
  tracks/
    TrackPanel.tsx                트랙 목록/트랙 조작 UI
  piano-roll/
    PianoRollView.tsx             피아노롤 전체 화면
    PianoRollRows.tsx             음표 행/피아노 키 표시
    PianoRollToolbar.tsx          피아노롤 도구 모음
    AudioRollView.tsx             오디오 클립 표시
  arrange/
    ArrangeView.tsx               편곡/타임라인 배치 화면
  panels/
    DetailPanel.tsx               선택 음표/재생/세부 설정 패널
    AutoMixPanel.tsx              자동 믹싱 패널
    TempoPanel.tsx                빠르기 조절 패널
  tempo/
    TempoSectionOverlay.tsx       빠르기 구간 오버레이
  dialogs/
    InstrumentDialog.tsx          악기 선택 창
    CollaborationDialog.tsx       협업 연결 창
```

## `lib/audio`

```text
lib/audio/
  toneTransport.ts                기존 외부 import 호환용 오디오 진입점
  audioCore.ts                    브라우저 오디오 시작/무음 처리
  playbackScheduler.ts            음표 스케줄링/재생 길이 계산
  previewNote.ts                  음표/악기 미리듣기
  exportMp3.ts                    MP3/WAV 렌더링 및 내보내기
  sf2DrumKit.ts                   SF2 드럼 사운드폰트 파서/재생기
  instruments/
    instrumentTypes.ts            오디오 악기 공통 타입
    instrumentRegistry.ts         악기 분류, 미리듣기 피치, 공통 상수
    instrumentReadiness.ts        악기 로딩 대기 처리
    createInstrument.ts           악기 생성 진입점
    synthInstrument.ts            Tone.js 기본 신스 악기
    drumKitInstrument.ts          기본 드럼 합성 악기
    soundFontInstrument.ts        일반 사운드폰트 악기와 캐시
    webAudioFontInstrument.ts     온라인 WebAudioFont 악기
```

## 최적화 변경점

1. `toneTransport.ts`를 작은 오디오 모듈로 분리했다.
   - 악기 생성, 사운드폰트 캐시, 드럼 합성, 미리듣기, 재생 스케줄링을 분리했다.
   - 기존 코드가 import하던 `lib/audio/toneTransport` 경로는 유지했다.

2. MP3/WAV 내보내기를 동적 import로 바꿨다.
   - 사이트 첫 진입 시 무거운 인코더 코드를 바로 불러오지 않는다.
   - 사용자가 내보내기 버튼을 눌렀을 때만 `exportMp3.ts`와 `lamejs` 계열 코드가 로드된다.

3. Vite 번들 분리를 추가했다.
   - React, Firebase, Tone.js, 인코더, 기타 vendor 코드를 별도 청크로 나눴다.
   - 초기 `index` JS 청크가 약 1,149.53kB에서 약 230.23kB로 줄었다.

4. 파일 다운로드/zip 생성 유틸을 분리했다.
   - `useFileActions.ts` 내부에서 매번 만들어지던 CRC 테이블을 모듈 단위 1회 생성 구조로 바꿨다.
   - 프로젝트 저장, MIDI 저장, 개별 악기 zip 저장의 역할이 더 명확해졌다.

5. 컴포넌트 폴더를 화면 역할별로 나눴다.
   - `layout`, `tracks`, `piano-roll`, `arrange`, `panels`, `tempo`, `dialogs`로 구분했다.

## 검증 결과

```bash
npm install
npm run build
```

빌드 통과 결과:

```text
✓ 1043 modules transformed.
✓ built
```

참고: 기존 프로젝트에는 `@ts-nocheck`, `any`, 일부 hook dependency 경고가 남아 있어 `npm run lint`는 아직 실패한다. 이번 작업의 기준 검증은 실제 배포 빌드 성공으로 잡았다.
