# BeginnerMusic 최신 압축 문맥

작성일: 2026-04-19

## 목표

BeginnerMusic은 한국어 입문자용 웹 작곡 편집기다. Signal MIDI와 비슷한 어두운 피아노 롤 중심 UI를 목표로 하며, 설명형 페이지가 아니라 실제로 음표를 입력하고 재생하고 저장하는 도구여야 한다.

## 작업 규칙

- 사용자가 직접 해야 하는 서버 실행, 배포, Firebase 연결은 Codex가 실행하지 않는다.
- 개발 서버 확인이 필요하면 `npm.cmd run dev`를 사용자에게 안내한다.
- 검증 명령은 `npx.cmd tsc -b tsconfig.app.json`, `npm.cmd run lint`, `npm.cmd run build`를 사용한다.
- PowerShell 환경에서는 `npm` 대신 `npm.cmd`를 사용한다.

## 핵심 파일

- `src/App.tsx`: 대부분의 편집기 UI, 상태, 피아노 롤 조작, 저장/불러오기, 재생 제어
- `src/App.css`: Signal MIDI 유사 어두운 UI와 피아노 롤/트랙/하단 패널 스타일
- `src/lib/audio/toneTransport.ts`: Tone.js 악기, SoundFont 로딩, 드럼 fallback, 미리듣기
- `src/lib/audio/exportMp3.ts`: MP3 오프라인 렌더링
- `src/lib/midi/importMidi.ts`: MIDI 불러오기와 템포/채널/트랙 변환
- `src/lib/midi/exportMidi.ts`: MIDI 저장, GM program, 채널, CC/Pitch Bend 이벤트
- `src/types/music.ts`: Project, Track, Note 타입

## 현재 기능

- 피아노 롤 음표 입력, 이동, 리사이즈, 우클릭 삭제, 드래그 삭제
- 선택 도구, 자유 선택(lasso), 선택 박스 이동
- 선택 박스 오른쪽 손잡이 드래그로 패턴 반복 복제
- 재생/일시정지/정지, Space 키 재생 토글, 빨간 재생 바 자동 이동
- 빈 프로젝트에서도 재생 상태 시작 가능, `Keys` 버튼을 켜면 재생 중 키보드 입력으로 음표 기록
- 트랙 추가, 트랙 선택, 악기 선택, 트랙 채널, 트랙 우클릭 메뉴
- 드럼 트랙은 GM drum note 행 이름을 표시하고, kick/snare/hat/tom/cymbal 계열 fallback 소리를 사용
- JSON/MIDI 불러오기, 드래그 앤 드롭 불러오기
- JSON/MIDI/MP3 저장
- Undo/Redo, 복사/잘라내기/붙여넣기/복제
- AutoMix 1차 버튼과 기능
- 하단 Velocity, Volume, Pan, Pitch Bend, Expression, Modulation, Event 편집
- Arrange 탭은 트랙별 배치 보기, Tempo 탭은 그래프 클릭 BPM 조절

## 최근 보정

- lasso 선택 중 선, 채움, 점이 보이도록 SVG 오버레이를 강화했다.
- 선택 음표 묶음을 이동할 때 선택 박스도 같이 움직이게 했다.
- 패턴 반복 손잡이가 최신 폭으로 반복 횟수를 계산하게 고쳤다.
- 키보드 입력 범위를 아래 줄, 홈 줄, 숫자 줄까지 늘렸다.
- Keys 옆 무용한 음표 버튼을 제거하고 Keys 버튼에 키보드 기호를 붙였다.
- AutoMix 버튼 안에 `fx.svg` 이미지를 추가했다.
- 드럼에서 MIDI 번호를 주파수처럼 해석하던 문제를 고쳤다.
- 피아노 롤 편집 공간은 마지막 음표 뒤에 항상 128마디 여유를 붙인다. 출력은 마지막 음표 끝 기준으로 끝낸다.
- 드럼 fallback은 GM drum note별로 여러 합성 경로를 사용한다. kick/snare/hat/tom/cymbal 외에도 clap, cowbell, vibraslap, conga, agogo, whistle, guiro, wood block, cuica, triangle을 분리했다.
- 피아노 롤 전용 확대/축소가 다시 있다. 도구줄 `-`/`+`, `Ctrl + 휠`, `Ctrl + +`, `Ctrl + -`를 사용한다.
- 우클릭 편집 메뉴는 바깥 왼쪽 클릭 또는 `Esc`로 닫힌다.
- Power Drum 느낌을 위해 kick/snare/hat/cymbal에 click, noise, metal layer를 더했다.
- `Ctrl+A`는 현재 선택 트랙의 모든 멜로디를 선택한다.
- 패턴 반복 손잡이는 원본 패턴 폭 단위로 스냅되며, 실제 반복 생성도 스냅된 횟수를 그대로 따른다.
- Vibraslap(58)은 cymbal 범위보다 먼저 처리해 고유한 드럼 fallback 소리를 낸다.
- AutoMix는 구간별 우선순위를 지원한다. `autoMixSections`에 이름, 시작/끝 beat, 적용 강도, 트랙별 1~5 우선순위를 저장하고, 실행 시 RMS/밀도 기반 볼륨 계산에 우선순위 가중치를 반영한다.
- 용어 단순화 편집용 Excel은 `outputs/terminology/beginner-music-terminology.xlsx`에 있다.
- AutoMix UI는 `믹스 컷` 카드 방식으로 단순화했다. 사용자는 컷의 시작/끝, 강도, 중심 트랙만 고르면 되고 나머지 우선순위는 자동으로 잡힌다.
- AutoMix 계산은 raw mix 값을 만든 뒤 최대값 기준으로 상대 정규화한다. 이전처럼 대부분 1.0에 붙어 변화가 약해 보이는 문제를 줄이기 위한 조정이다.
- 재생 중 AutoMix를 실행하면 현재 위치에서 재생을 다시 시작해 새 트랙 볼륨이 들리도록 했다.
- 사이트 전체 스크롤은 막고, 트랙 목록은 내부 스크롤로 제한했다.
- 보이는 UI 문구와 악기 표시명은 한국어 중심으로 바꿨다. General MIDI 128개 악기는 한국어 표시명을 사용한다.
- AutoMix는 트랙 볼륨뿐 아니라 믹스 컷과 겹치는 음표의 `volume` 값도 직접 조절한다.
- 용어 Excel은 영어 원어 열 없이 한국어 전용 표로 다시 생성했다.
- AutoMix는 컷이 없어도 버튼만 누르면 `전체 곡`을 임시 컷으로 삼아 바로 적용된다.
- 피아노 롤은 선택 트랙 음표의 최저/최고 pitch에 맞춰 행 범위를 자동 확장하므로 높은 음도 표시/편집할 수 있다.
- 하단 세부 편집 탭의 중복 서브 설명은 제거했다.

## 남은 큰 개선

- 실제 샘플 기반 드럼: midi-js-soundfonts 원본 계열은 percussion/channel 10 직접 지원이 제한적이라, GeneralUser GS 같은 SF2/GS 은행을 로컬 mp3 샘플로 변환해 GM drum note별로 연결하는 방향이 적합하다.
- Arrange 탭의 실제 편곡/클립 편집 기능은 아직 1차 보기 수준이다.
- AutoMix는 1차 볼륨 균형 조절이며, 악기 간 주파수 마스킹 기반 자동 믹스는 이후 작업이다.

## 2026-04-19 사용자 제공 SF2 드럼킷

- `C:/Users/MINJAE/Downloads/Standard_Dum_Kit__by_Charlie.SF2`를 `public/soundfonts/Standard_Dum_Kit__by_Charlie.SF2`로 복사했다.
- `src/lib/audio/sf2DrumKit.ts`가 SF2의 RIFF/sdta/pdta 데이터를 브라우저에서 직접 파싱해 bank 128 드럼 프리셋의 GM drum note별 샘플을 재생한다.
- `src/lib/audio/toneTransport.ts`의 드럼 악기 생성 경로는 SF2 드럼킷을 우선 사용하고, 로딩 실패나 누락된 키는 기존 Tone.js 합성 드럼 fallback을 사용한다.
- 검증은 `npx.cmd tsc -b tsconfig.app.json`, `npm.cmd run lint`, `npm.cmd run build` 모두 통과했다.

## 2026-04-19 최신 추가 수정

- 드럼이 기존 합성음처럼 들리던 핵심 원인을 고쳤다. 재생/미리듣기 스케줄러가 드럼에도 주파수를 넘기던 것을, 드럼 악기만 GM drum note 번호를 그대로 받도록 `expectsMidi` 경로로 분리했다.
- 패턴 반복은 복제본이 바로 붙지 않고 0.25 beat 간격을 두고 반복된다.
- 자동 믹스 실행 중에는 화면 중앙에 `자동 믹스 중` 오버레이가 뜨고, 작업을 잠깐 막는다.
- 상단 `믹스 우선순위` 탭을 추가했다. 컷이 없으면 기본 우선순위로 자동 믹스가 동작하고, 컷을 만들면 구간별 중심 트랙과 강도를 지정한다.
- `audioClips`를 프로젝트에 추가했다. 선택 트랙에 오디오 파일을 넣거나 음성 녹음을 만들 수 있고, 배치 탭에서 초록색 클립으로 보인다.
- 오디오 클립은 재생과 MP3 출력에 포함된다. 오디오 클립이 있으면 MIDI 저장은 경고 후 막는다.

## 2026-04-19 드럼 SF2 sampleRate 보정

- `Standard_Dum_Kit__by_Charlie.SF2` 원본과 public 복사본의 SHA256 해시가 동일함을 확인했다.
- 이 SF2의 일부 샘플 헤더 sampleRate가 비정상적으로 커서 브라우저에서 그대로 재생하면 드럼 소리가 매우 짧고 이상하게 들린다.
- `sf2DrumKit.ts`에서 드럼 샘플 AudioBuffer는 `44100Hz`로 고정해 만들고, 드럼은 피치 변형 없이 `playbackRate = 1`로 재생한다.
- 드럼만 SF2 로딩 대기 시간을 7초로 늘려 첫 재생에서 fallback 합성 드럼으로 새는 가능성을 줄였다.

## 2026-04-19 드럼 종류 확장

- 드럼 피아노 롤 범위를 35~81에서 26~87로 넓혔다. 이 범위는 현재 사용자 제공 SF2에서 확인된 드럼 샘플 매핑 범위에 맞춘 것이다.
- 드럼 라벨에 스냅, 큐, 슬랩, 스크래치, 메트로놈, 봉고, 콩가, 팀발레스, 아고고, 카바사, 마라카스, 휘슬, 귀로, 우드블록, 쿠이카, 트라이앵글, 셰이커, 징글벨, 벨트리, 캐스터네츠, 수르도 등을 추가했다.
- 드럼 트랙의 음표 블록은 `C5` 같은 피치명 대신 타악기 이름을 표시한다.
- 드럼 트랙 왼쪽 키 영역은 피아노 흑백 건반이 아니라 드럼 패드 목록처럼 보이도록 스타일을 분리했다.

## 2026-04-19 AutoMix 체감 보강

- AutoMix는 이제 트랙 역할을 분류한다. 역할은 `리듬 중심`, `저음 받침`, `주요 선율`, `리듬 악기`, `배경 선율`, `보조 선율`, `신스 선율`, `공간 배경`, `중심 악기`다.
- 역할, 우선순위, 음표 밀도, RMS를 기준으로 트랙 전체 음량을 더 분명하게 바꾼다.
- 트랙에 `pan` 값을 추가했다. 드럼/베이스/주요 선율은 가운데, 배경/리듬/보조 악기는 좌우로 배치한다.
- 구간 우선순위는 해당 구간 음표의 `volume`과 `pan`에도 반영된다.
- 왼쪽 트랙 목록에는 현재 음량 막대와 좌우 위치가 보인다.
- AutoMix 우선순위 패널과 `믹스 우선순위` 탭에는 트랙별 역할, 음량 전/후, 좌우 위치, 보정된 음표 수 리포트가 표시된다.
## 2026-04-20 락 드럼 SoundFont 적용

- 드럼 소리를 락 드럼 스타일에 가깝게 만들기 위해 Zanderjaz 무료 SoundFont 목록에서 `Drum Set JD Rockset 5.sf2`와 `TamaRockSTAR.sf2`를 내려받아 `public/soundfonts`에 추가했다.
- `sf2DrumKit.ts`는 `DrumSetJDRockset5.sf2` → `TamaRockSTAR.sf2` → `Elementic.sf2` → `Standard_Dum_Kit__by_Charlie.SF2` 순서로 드럼 SF2를 시도한다.
- SF2 sample header 파싱 오프셋을 고쳤다. 이전에는 `sampleRate`, `originalPitch`, `pitchCorrection`을 잘못 읽을 수 있어 드럼 파일을 바꿔도 이상하게 들릴 수 있었다.
- 드럼 preset 선택은 bank 128과 `rock`, `tama`, `jd`, `drum`, `kit` 이름을 우선한다.
- 검증: `npx.cmd tsc -b tsconfig.app.json`, `npm.cmd run lint`, `npm.cmd run build` 통과. Vite chunk 크기 경고만 기존처럼 남는다.

## 2026-04-20 드럼 최소 울림 시간 보정

- 사용자가 드럼 소리가 멜로디 길이에 너무 의존해 딱딱 끊긴다고 지적했다.
- 재생 스케줄러에서 드럼 트랙은 일반 멜로디 악기처럼 `triggerAttack` 후 노트 길이에 맞춰 바로 `triggerRelease`하지 않고, 원샷 드럼 히트로 `triggerAttackRelease`하게 분리했다.
- 킥, 스네어, 하이햇, 탐, 심벌, 퍼커션별 최소 울림 시간을 둬서 아주 짧은 음표라도 일정 tail이 남도록 했다.
- SF2 드럼 미리듣기/건반 release도 최소 울림 시간 전에는 바로 끊지 않고, 실제 정지/dispose 때만 강제로 끊게 했다.
- 검증: `npx.cmd tsc -b tsconfig.app.json`, `npm.cmd run lint`, `npm.cmd run build` 통과. Vite chunk 크기 경고만 기존처럼 남는다.

## 2026-04-20 반복 음표 어택과 트랙 음량 조절

- 사용자가 같은 피치의 음표가 맞닿아 있으면 한 번만 들리고, 비드럼 악기는 그 경우에도 뚝뚝 다시 어택되어야 한다고 지적했다.
- 실시간 재생 스케줄러에서 비드럼 트랙도 각 음표 시작마다 `triggerAttackRelease`를 새로 호출하도록 바꿨다. 같은 음이 이어져도 새 음표마다 다시 시작점이 들린다.
- 드럼 행 이름을 한국인이 더 바로 이해할 수 있도록 `킥 드럼(쿵)`, `스네어(탁)`, `닫힌 하이햇(짧게 칙)`, `크래시 심벌(쾅)`처럼 소리 느낌을 함께 넣었다.
- 왼쪽 트랙 카드에 악기별 음량 슬라이더를 추가했다. 사용자는 각 트랙 음량을 0~120 범위에서 직접 조절할 수 있다.
- 검증: `npx.cmd tsc -b tsconfig.app.json`, `npm.cmd run lint`, `npm.cmd run build` 통과. Vite chunk 크기 경고만 기존처럼 남는다.

## 2026-04-20 Standard Drum Kit 추가

- 사용자가 현재 락 성향의 드럼은 좋지만 약한 드럼도 하나 더 필요하다고 요청했다.
- 악기 목록의 Drums 카테고리에 `Power Drum Kit` 다음 `Standard Drum Kit`을 추가했다.
- `Power Drum Kit`은 기존처럼 `DrumSetJDRockset5.sf2`와 `TamaRockSTAR.sf2`를 우선 사용한다.
- `Standard Drum Kit`은 `Standard_Dum_Kit__by_Charlie.SF2`를 우선 사용하고, 실패 시 다른 드럼 SF2로 fallback한다.
- 두 드럼 키트 모두 피아노롤에서는 드럼 행 이름을 쓰고, MIDI 저장 시 GM 드럼 채널로 처리된다.
- 검증: `npx.cmd tsc -b tsconfig.app.json`, `npm.cmd run lint`, `npm.cmd run build` 통과. Vite chunk 크기 경고만 기존처럼 남는다.

## 2026-04-20 키보드 실시간 입력 정확도 개선

- 사용자가 키보드 입력으로 실시간 멜로디를 찍을 때 정확도가 떨어진다고 지적했다.
- `keydown`/`keyup` 이벤트가 실제 발생한 `event.timeStamp` 기준으로 재생 beat를 계산하도록 바꿨다. 이벤트 처리 지연이 기록 위치에 덜 반영된다.
- 키보드 입력 기록은 기존 grid snap 대신 1/64 beat 단위로만 가볍게 보정한다. 실시간 연주 느낌을 덜 망가뜨리면서 너무 지저분한 소수 beat는 줄이기 위한 절충이다.
- 재생 중인 선택 트랙 악기가 이미 준비되어 있으면 별도 preview 악기를 만들지 않고 그 악기로 즉시 `triggerAttack`/`triggerRelease`한다. 이로써 키를 눌렀을 때 소리 반응 지연을 줄였다.
- 드럼 키트는 키 입력 때도 원샷 hit로 재생하고, 비드럼 악기는 keyup 시점에 release한다.
- 검증: `npx.cmd tsc -b tsconfig.app.json`, `npm.cmd run lint`, `npm.cmd run build` 통과. Vite chunk 크기 경고만 기존처럼 남는다.

## 2026-04-20 오디오 파일 트랙과 MP3 출력 보정

- 사용자가 파일로 악기를 업로드하면 별도 트랙이 추가되고, 멜로디가 아니라 주파수/파형처럼 보여야 한다고 요청했다.
- 오디오 파일 업로드와 드래그 앤 드롭은 이제 파일마다 `오디오 트랙`을 새로 만든다. 오디오 트랙은 `instrumentId: audio-track`, `kind: audio`로 구분한다.
- 오디오 트랙을 선택하면 피아노롤 대신 파형 편집 화면이 나온다. 파형을 위아래로 드래그하면 해당 오디오 클립 볼륨이 0~150 범위에서 바뀐다.
- 배치 화면의 오디오 클립도 단순 초록 블록이 아니라 파형 막대를 함께 보여준다.
- 실시간 재생의 오디오 클립은 HTMLAudioElement 대신 Web Audio `AudioBufferSourceNode + Gain + StereoPanner`로 재생한다. 트랙/클립 볼륨과 좌우 위치가 MP3 출력과 더 비슷하게 적용되도록 하기 위한 변경이다.
- MP3 출력은 강한 compressor를 제거하고 master gain 중심으로 바꿨다. 오디오 클립 gain 범위와 드럼 최소 울림 시간도 편집기 재생과 맞췄다.
- 검증: `npx.cmd tsc -b tsconfig.app.json`, `npm.cmd run lint`, `npm.cmd run build` 통과. Vite chunk 크기 경고만 기존처럼 남는다.

## 2026-04-20 선택 박스 위치와 패턴 반복 안정화

- 사용자가 박스 선택 후 화면 크기나 줌이 바뀌면 선택 박스가 음표 위치와 어긋나고, 패턴 반복 핸들을 늘릴 때 반복 개수가 갑자기 튄다고 지적했다.
- 선택 박스는 이제 저장된 픽셀 좌표만 유지하지 않고, 선택된 음표들의 실제 beat/pitch 위치를 기준으로 다시 계산한다.
- 선택 음표, 피아노롤 폭, 줌, 음표 단위, 피치 행이 바뀌면 선택 박스 위치와 크기를 현재 화면 기준으로 재계산한다.
- 패턴 반복 미리보기는 `Math.round` 대신 드래그한 거리를 패턴 단위로 `Math.floor`해서 계산한다. 임계점 근처에서 한 번에 두 칸처럼 튀는 느낌을 줄이기 위한 변경이다.
- 검증: `npx.cmd tsc -b tsconfig.app.json`, `npm.cmd run lint`, `npm.cmd run build` 통과. Vite chunk 크기 경고만 기존처럼 남는다.
