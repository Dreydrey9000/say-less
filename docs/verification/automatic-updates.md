# Automatic updates — October 2, 2026

## Behavior

- Existing update-check preference now controls automatic checks and downloads. It is visible under Advanced, including when Debug mode is off. The system updater lock still overrides it.
- Launch, six-hour timer, focus after 30 minutes, and the existing manual-check event share a single check/download operation.
- Tauri updater 2.10.1 verifies the signature in `download()`; it retains the package until installation or resource cleanup. Its default capability already permits separate download and install commands.
- A downloaded update offers Later and Restart to update. No automatic install or restart occurs. The restart action queries current dictation and screen-recorder activity; known active states block it. This is a point-in-time check, not a native transaction locking out a new recording during installation.
- Disabled/obsolete effect results are discarded, and native resources are closed. Tauri does not expose cancellation for an in-flight download; it completes or times out before its resource is discarded.
- Portable installs keep their manual installer link. Failed downloads can retry. Failed installs do not relaunch.
- Packages are retained in the current process, not persisted across quits. A future launch may download them again.

## Verified locally

- Production frontend build, ESLint, translation-key consistency, Prettier and Rust formatting: passed.
- `bunx playwright test tests/automatic-updates.spec.ts tests/clarity.spec.ts --workers=1`: 24 passed. These are browser fixtures mocking native IPC, not real installer tests.
- Tests cover one automatic download, explicit install/relaunch ordering, no automatic install, five busy recording/transcription states, download retry, installer failure, preference off, system lock, portable installer, and disabling during a download followed by re-enabling.
- Rendered browser fixture checked at 680×570 and 390×844. New setting description, toggle, and restart control fit; narrow document width equals viewport width. Keyboard Space toggles automatic updates and changes footer to Updates off. Existing ready-toast clearance check passes.
- New English strings are supplied as fallback text in all interface-language resources; this is not a new professional translation pass.

## Release acceptance still required

These changes are not in installed 0.14.8. Before claiming native automatic-download delivery, build signed/notarized release artifacts, verify their published manifest, and exercise an older installed version through Update now. To prove the new split download/install flow itself, run the new build against a subsequent newer signed release and verify automatic download, Later, explicit restart, retained settings, and the resulting installed version on supported platforms. Browser mocks and a published manifest alone do not prove installation.

The independent production 0.14.8 voice retry completed with an exact synthetic transcript: 1.6956 seconds of audio, 1,479 ms model load, 808 ms inference, 4.362 seconds total process wall time. It covers the packaged engine only, not microphone-to-paste latency. No performance source change or speedup claim accompanies this updater change.
