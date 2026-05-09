# 🎵 나의 첫 멜로디

> 초보자 친화적 웹 기반 DAW

'나의 첫 멜로디'는 웹 기반의 음악 작곡 도구로, 누구나 음악 작곡을 쉽게 하는 것을 목표로 만들었습니다.

전통적인 DAW는 복잡한 기능들과 어려운 용어 등 때문에 초보자에게 부담이 될 수 있다는 단점이 있습니다. '나의 첫 멜로디'는 간편한 음악 작곡을 할 수 있게 해주기에 이러한 문제를 해결할 수 있습니다.

---

## ✨ 특징

### 🎹 음악 편집기
- 그리드를 기반으로 한 작곡 화면
- 마우스 클릭을 통해 음표를 만듦
- 드래그해서 음표를 늘리거나 움직일 수 있음
- 패턴 반복 지원
- 전체 악기 편집 지원


### 🇰🇷 초급자 친화적인 UX
- 간단명료한 용어
- 직관적인 조작감
- 신규 사용자들을 위해 어려운 작업들의 간소화

### 💾 파일 지원
- JSON 형식으로 파일을 저장하거나 불러옴
- MIDI 형식으로 파일 내보내기 지원
- MP3 형식으로 파일 내보내기 지원

### 🎧 재생 시스템
- 실시간 재생
- 키보드를 통해 실시간 음표 생성 가능
- 재생과 스크롤의 동기화
- 재생 음표 미리보기

---


## 🏗️ 프로젝트 구조

```text
src/
 ┣ features/
 ┃ ┗ editor/
 ┃   ┣ components/
 ┃   ┣ hooks/
 ┃   ┣ utils/
 ┃   ┗ types/
 ┣ assets/
 ┣ constants/
 ┣ types/
 ┗ utils/
```

이 프로젝트는 기존의 단일 파일 구조에서 모듈 기반 구조로 재구성됐습니다.

---

## 🚀 기술 스택

- React
- TypeScript
- Vite
- Tone.js
- Firebase

---

## 📦 설치

```bash
git clone https://github.com/ryanmj1202/BeginnerMusic.git
cd BeginnerMusic
npm install
npm run dev
```

---

## 🔨 빌드

```bash
npm run build
```

---

## 📜 라이선스

MIT License

Copyright (c) 2026 강민재

---

## 참고

해당 프로젝트는 [OpenAI](https://openai.com)사의 인공지능 에이전트 [Codex](https://chatgpt.com/codex)를 활용해 개발되었습니다.
