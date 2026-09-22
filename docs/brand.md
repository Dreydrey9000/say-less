# Say Less identity

Say Less uses a silver speech-shaped S on charcoal: a compact emblem for the desktop app and future coaching-portal listing. The name remains readable text beside the emblem, rather than baked into an image.

- Master image: [say-less-emblem.png](../public/brand/say-less-emblem.png).
- Application icons: `src-tauri/icons` (generated using `bun run tauri icon public/brand/say-less-emblem.png`).
- The menu-bar mark is a simplified monochrome speech S, with distinct recording, processing, and warning states.
- Keep the mark square and uncropped. Keep at least one quarter of its displayed width clear of adjacent content.
- The master also works as a square coaching-portal tile. Portal integration and public distribution are pending.

The emblem was generated for this project. Do not represent it as a photograph of Drey. Handy attribution, dependency names, and model-source URLs remain accurate upstream references.

## Local verification — September 22, 2026

Version 0.9.8 compiled and was installed at `/Applications/Say Less.app`. The installed macOS window and HTML title read Say Less; the permission screen displays the new emblem and silver controls. Microphone permission was recognized; Accessibility still requires the user's approval for this build, so settings and the update notice were not verified through that gate. The menu-bar resource selected at launch was the new `tray_idle.png`.

Frontend build, ESLint, translation consistency, Prettier, Rust formatting, the two existing Playwright checks, and local bundle signature verification passed. The Playwright checks cover the web shell, not native permissions or dictation. No public release or portal integration was performed. The app uses local ad-hoc signing and is not notarized for distribution.
