# Say Less 0.11.0 verification

Verified September 23, 2026 on Apple Silicon macOS.

- 292 Rust library tests passed, including hold/tap/double-tap state transitions, whole-word corrections with punctuation, invalid dock preferences, and existing dictation tests.
- 39 Playwright tests passed. The 10 companion tests were rerun after the final fixture adjustment and passed. Coverage includes 390/1200 px home screens in dark/light, 360 px dock, keyboard controls, enlarged text, reduced motion, persisted preferences, duplicate corrections, and history failure/retry. IPC is mocked in these browser tests.
- Frontend build, ESLint, translation-key coverage, Prettier, cargo fmt, git diff whitespace checks, and cargo clippy passed. Clippy retains one pre-existing unused-assignment warning in `managers/transcription.rs`. Vite retains its large-chunk warning. Newly added locale entries use English fallback copy.
- Built the macOS app with Apple Development signing, verified its signature with `codesign --verify --deep --strict`, backed up the previous installed app, and installed `/Applications/Say Less.app`.
- Native UI visibly reports 0.11.0, shows the new in-app update and Home screen, and retains working permission access. Sentence formatting, normal-shortcut AI cleanup, personal spelling corrections, custom vocabulary, floating visibility, and right-edge placement were saved through native controls.
- Apple Intelligence availability returned true. During the installed-app check, its backend logged successful real dictation cleanup; the visible dock transitioned from Working back to Record. No transcript content is retained in this verification document.
- Native Appearance previews and floating dock were visually inspected. Particle position changed between dock captures. The cycle option can be enabled; the final user preference is not forced when the user switches a formation.

Limits: this is a local development-signed Mac build, not a notarized public release or a Windows installer. Screen-edge placement is explicit, not magnetic snapping during drag. Custom animation imports, a download website, portal integration, and full Wispr Flow feature parity remain unimplemented. Automated state-machine tests do not certify recognition accuracy for every voice or acoustic environment.
