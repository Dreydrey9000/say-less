# Say Less 0.12.0 verification

September 23, 2026 · Apple Silicon macOS.

- 295 Rust library tests passed. New regressions cover ordinary words staying unchanged near custom names, conservative spelling-edit detection, repeated observations activating a rule, and conflicts preserving an accepted spelling.
- 43 Playwright tests passed. The four new compact/learning tests were rerun after final UI feedback changes and passed. They cover expansion/collapse without accidental recording, character persistence, observing/keeping/removing a correction, and save failure retaining the observation. Existing narrow-layout, light/dark, keyboard, enlarged-text and reduced-motion tests remain included. Browser tests mock IPC.
- TypeScript/Vite build, ESLint, formatting, translation-key coverage, and cargo clippy passed. Existing large-bundle and unused-assignment warnings remain. New locale copy uses English fallbacks.
- Built 0.12.0 with the existing Apple Development identity, backed up 0.11.0, installed to `/Applications/Say Less.app`, and passed deep strict signature verification.
- Native app showed 0.12.0 and its in-app update. The compact orb visibly expanded into recording controls. Character + particles was selected through native Appearance controls and visibly collapsed into the small character. Local correction learning was enabled through Writing. A test correction pair was verified in the correct direction, and the temporary rules were removed.
- A synthetic speech test began in a new temporary TextEdit document. The Mac locked before the stop/edit step; the test was cancelled through the app's supported `--cancel` command. The application log confirmed cancellation completed and returned to idle. **Native end-to-end edit observation is not yet verified.** The temporary Mute While Recording setting was turned off for that test and must be restored in the unlocked UI. No claim of a successful native learning observation is made.

Learning is a conservative Mac-only local dictionary feature, not model training or complete Wispr parity. It watches a supported focused field for at most 90 seconds after an ordinary paste; it skips secure fields, auto-submit, reliable paste and unsupported output paths. See [behavior and limits](../personalization.md).

This is a development-signed local Mac build. Public notarized installers, Windows validation, a download site, and portal distribution remain separate work. Repository screenshots use safe application fixture state; the README directly embeds those pictures and the editable/rendered workflow diagram.
