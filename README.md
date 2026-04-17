# BeginnerMusic

BeginnerMusic is a beginner-friendly web music composition tool built with React, TypeScript, Vite, Tone.js, and Firebase Firestore.

## Why this stack

- React: dynamic timeline, tracks, piano roll, and pattern UIs fit well into component-based state updates.
- Vite: fast local startup and HMR keep iteration speed high while building audio UI.
- TypeScript: track, note, pattern, and mixing data need strict typing to reduce runtime bugs.
- Tone.js: wraps the Web Audio API for instruments, scheduling, and transport control.
- Firebase Firestore: stores projects without introducing a custom backend server.
- Vercel: simple deployment target for a Vite frontend.

## Setup

1. Install dependencies:

```bash
npm.cmd install
```

2. Add local environment variables:

```bash
Copy-Item .env.example .env.local
```

3. Fill in your Firebase values in `.env.local` when Firebase work starts.
   The first editor milestone can run without Firebase values.

4. Start local development:

```bash
npm.cmd run dev
```

PowerShell may block `npm.ps1` on this machine, so use `npm.cmd` for local commands.

## Project structure

```text
src/
  components/
  features/
    piano-roll/
    drum-pattern/
    automix/
    chord-engine/
  lib/
    audio/
    firebase/
    mixing/
    music-theory/
    terminology/
  store/
  types/
```

## Implemented scaffold

- Terminology simplification layer with user-facing labels like `세기` and `소리 크기`
- Drum pattern reference expansion logic
- Deterministic chord recommendation engine
- AutoMix interference calculation module
- Firebase initialization and project repository example
- Demo dashboard wiring those modules together
