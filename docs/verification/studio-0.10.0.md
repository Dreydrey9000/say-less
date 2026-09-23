# Say Less 0.10.0 verification

Verified locally September 22, 2026 (America/New_York) on the M3 Pro Mac.

## Automated checks

- 289 Rust library tests cover existing transcription behavior and new action matching, URL restrictions, color validation, deterministic styles, Wispr JSON/CSV parsing, duplicate preservation, and file limits.
- 24 Playwright workflows use the real React screens with test-only Tauri IPC. Coverage includes palette persistence, contrast selection, failed saves, floating controls, app styles, action failures, import preview-before-apply, opt-in history, narrow layouts, and the update archive's actual image loading.
- Frontend build, lint, translation-key checks, formatting, and Clippy. New non-English locale copy is English fallback, not completed localization.
- Native bundle signed with the Mac's existing Apple Development identity and verified with codesign. This is a development build, not a notarized public release.

## Native app evidence

- Appearance renders in dark mode; choosing Pool blue updates and persists the saved color.
- The dock initially showed a blank native panel. Routing show/resize through the same Tauri path as the recording overlay, and disabling hide-on-deactivate, fixed it. The installed dock then displayed the emblem, blue Record button, settings gear, close button, grip, and idle status.
- Hiding the main window left the dock available. Its gear opened the main settings window successfully. Dock visibility and color survived app restart.
- A saved `open notes` action targeting `/System/Applications/Notes.app` reported success, and Notes was independently confirmed running. No note contents were inspected. Voice activation itself still awaits microphone-to-action acceptance.
- The real read-only Wispr preview reported 37 words, 5 snippets/corrections, zero skips, and 8,900 history records at the time of the check. Source counts can change while Wispr is used. No personal library or history migration was applied during this test.
- macOS System Settings displayed both Say Less permission switches on. The old running app recognized the microphone grant but returned false for Accessibility. The development-signed replacement still recognized the microphone grant after restart; Accessibility remained unresolved. No security permissions were changed by the agent.

## Remaining acceptance and limitations

The user must refresh macOS Accessibility trust for the current signed application, then test live microphone-to-paste and microphone-to-action behavior. The dock's native appearance and settings button are verified; actual drag placement and recording controls need hands-on acceptance. UI/command tests do not prove real audio capture. The importer matches the installed Wispr schema and documented file formats; real apply/rollback and history migration were not exercised against the user's personal library. No Wispr files were modified.

Full Flow parity is not claimed: selected-text voice editing, contextual AI tone/backtracking, automatic vocabulary learning, IDE file tagging, mobile, and team/sync functionality remain absent. See [comparison](../wispr-comparison.md) and [setup/limits](../personalization.md).
