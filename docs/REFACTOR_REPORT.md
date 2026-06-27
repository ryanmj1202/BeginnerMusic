# 리팩터링 작업 보고서

## 작업 목표

- 파일 역할을 기능별로 분리한다.
- 기존 UI/UX와 기능을 유지한다.
- 한국어 문구가 깨지지 않도록 한다.
- 렉, 딜레이, 초기 로딩 부담을 줄인다.

## 실제 변경한 파일/폴더

### 새로 추가한 오디오 구조

```text
src/lib/audio/audioCore.ts
src/lib/audio/playbackScheduler.ts
src/lib/audio/previewNote.ts
src/lib/audio/instruments/createInstrument.ts
src/lib/audio/instruments/drumKitInstrument.ts
src/lib/audio/instruments/instrumentReadiness.ts
src/lib/audio/instruments/instrumentRegistry.ts
src/lib/audio/instruments/instrumentTypes.ts
src/lib/audio/instruments/soundFontInstrument.ts
src/lib/audio/instruments/synthInstrument.ts
src/lib/audio/instruments/webAudioFontInstrument.ts
```

### 새로 정리한 컴포넌트 구조

```text
src/features/editor/components/layout/
src/features/editor/components/tracks/
src/features/editor/components/piano-roll/
src/features/editor/components/arrange/
src/features/editor/components/panels/
src/features/editor/components/tempo/
src/features/editor/components/dialogs/
```

### 새 유틸

```text
src/features/editor/utils/fileDownloadUtils.ts
```

## 성능 관련 변경

- `exportMp3.ts` 정적 import 제거
- MP3/WAV 내보내기 시점에만 동적 import
- Vite vendor chunk 분리
- zip 생성용 CRC 테이블을 hook 내부 생성에서 모듈 1회 생성으로 변경
- 사운드폰트 캐시 로직은 유지하면서 파일만 분리

## 유지한 것

- 기존 UI/UX 유지
- 기존 기능 제거 없음
- 새 사용자 기능 추가 없음
- 한국어 문자열 유지
- 기존 `toneTransport` import 경로 유지

## 확인 명령

```bash
npm install
npm run build
```

빌드가 통과하면 설치/배포 가능한 상태다.
