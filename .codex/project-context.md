# BeginnerMusic Project Context

Purpose: active project facts only. Historical notes are archived under `.codex/archive/`.

## Project

BeginnerMusic is a beginner-friendly web DAW for composing, editing, playing, and exporting music in the browser.

## Tech Stack

- React 19, TypeScript, Vite
- Tone.js for playback and preview
- `lamejs` for MP3 encoding
- Browser localStorage for autosave

## Commands

- Dev server: `npm.cmd run dev`
- Build: `npm.cmd run build`
- Type check: `npx.cmd tsc -b tsconfig.app.json`
- Lint: `npm.cmd run lint`

## First Files To Check

- `src/main.tsx`: app entrypoint.
- `src/App.tsx`: default export wrapper for the editor.
- `src/EditorApp.tsx`: compatibility re-export for older imports.
- `src/features/editor/EditorApp.tsx`: current editor composition root.
- `src/features/editor/`: editor components, hooks, constants, helpers, and types.
- `src/lib/audio/`: playback, SoundFont, drum, and MP3 export logic.
- `src/lib/midi/`: MIDI import/export logic.
- `src/types/music.ts`: project, track, note, and clip data types.

## Main Behavior

- Piano roll note input, move, resize, selection, lasso, repeat, copy, paste, and delete.
- Multi-track editing with selected-track notes and other-track ghost notes.
- Track creation, selection, instrument selection, volume, pan, and role-based AutoMix.
- Playback, preview notes, keyboard recording, playhead seeking, and auto-scroll.
- JSON project save/load, MIDI import/export, MP3 export, audio clips, and voice recording.
- Drum tracks use GM drum-note rows and SF2 drum kits with synthesized fallback.

## UI Rules

- Preserve the current dark Signal MIDI-like editor UI.
- Keep Korean beginner-friendly labels for visible UI text.
- Keep editor-first behavior; do not add landing pages or explanatory screens.
- Do not change layout, colors, copy, or interaction patterns unless requested.

## Implementation Notes

- Root `EditorApp.tsx` is only a compatibility re-export; implementation lives in `src/features/editor/EditorApp.tsx`.
- Long historical work logs should not be added back to active context files.
- Put only recent one-line notes in `.codex/latest-context.md`.
- Move detailed history to `.codex/archive/`.
- Avoid reading generated, dependency, build, lock, or archive files unless explicitly needed.

## Project Rules For Codex

- Use targeted search before opening files.
- Read only relevant line ranges.
- Preserve existing behavior and design.
- Avoid unrelated refactors and formatting-only changes.
- Use PowerShell commands with `.cmd` wrappers for npm/npx on Windows.
- Do not run the dev server unless explicitly requested; tell the user the command instead.
