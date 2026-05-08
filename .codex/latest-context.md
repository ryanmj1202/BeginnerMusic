# BeginnerMusic Latest Context

Purpose: only recent active notes. Full history before token cleanup is in `.codex/archive/`.

## Recent Notes

- 2026-05-06: Active context was reduced to lower Codex token usage.
- 2026-05-06: Full previous `.codex/project-context.md` was backed up to `.codex/archive/project-context-before-token-cleanup.md`.
- 2026-05-06: Full previous `.codex/latest-context.md` was backed up to `.codex/archive/latest-context-before-token-cleanup.md`.
- 2026-05-06: `EditorApp.tsx` was checked and is used through `src/App.tsx`.
- 2026-05-06: Editor implementation moved to `src/features/editor/EditorApp.tsx`; root `src/EditorApp.tsx` is now a re-export.
- 2026-04-20: Standard Drum Kit and Power Drum Kit behavior exists in the editor.
- 2026-04-20: Keyboard real-time input uses event timestamps and light 1/64 beat correction.
- 2026-04-20: Drum notes use minimum tail behavior so short notes do not cut off too abruptly.
- 2026-04-19: Audio clips are part of project playback and MP3 export; MIDI export is blocked when audio clips exist.
- 2026-04-19: AutoMix adjusts track volume/pan and selected note volume for mix sections.
- 2026-04-19: Visible UI labels and General MIDI instrument names are Korean-centered.

## Remaining Notes

- Arrange tab is still closer to a first-pass arrangement view than a full clip editor.
- AutoMix is first-pass balance automation, not frequency masking or mastering.
- Future task logs should stay as one-line notes here; detailed history belongs in `.codex/archive/`.
