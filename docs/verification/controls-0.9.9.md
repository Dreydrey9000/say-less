# Say Less 0.9.9 controls verification

Verified September 22, 2026 on this M3 Pro Mac. Installed at `/Applications/Say Less.app` from branch `codex/nemotron-streaming`.

## Automated checks

- Rust library tests: 281 passed, including seven local snippet matcher/validation tests.
- Playwright: 14 passed. Real React screens with mocked Tauri IPC cover save/reload/edit/remove/undo, failed saves and loads, setting rollback, keyboard interaction, dark/light themes at 390/680/1200px, enlarged text, permission-free browsing, and stalled audio-device fallback.
- Production frontend build, ESLint, Prettier, Rust formatting, and Clippy completed successfully. Clippy retains the existing unused-assignment warning.
- Translation keys complete for all 25 non-English locales; new copy remains English fallback, not completed linguistic localization.
- macOS debug app bundle built; installed bundle passes `codesign --verify --deep --strict`.

## Actual installed app

- Say Less name, emblem, settings navigation, silver controls, and version 0.9.9 inspected visually.
- Browsed settings without granting microphone/accessibility access. Input automation remains gated on setup completion.
- Created the temporary cue `say less verification` with a two-line expansion. Real Rust preview of `SAY LESS VERIFICATION!` returned the exact saved text and line break.
- Snippet survived app quit, replacement, and restart. Native removal and Undo both verified; temporary test snippet removed afterward.
- Reset controls expose setting-specific accessible names. Device enumeration stalled on this Mac; the final build visibly falls back to Default within five seconds instead of permanent Loading. Output selection correctly stays disabled while audio feedback is off.
- New in-app update appeared and was dismissed during verification.

## Limits

This is an ad-hoc signed debug build, not a notarized distribution release. No OS permissions were granted on the user's behalf. Real microphone-to-paste, history recovery, cross-app behavior, low-memory computers, and side-by-side Wispr quality comparisons still need acceptance testing. No coaching portal publication occurred. See [capability comparison](../wispr-comparison.md) for remaining feature gaps.
