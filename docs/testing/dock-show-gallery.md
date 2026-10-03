# Dock visibility and appearance gallery

Tested on macOS, October 3, 2026.

## Changes

- The Mac floating dock is built hidden, unfocused, and non-focusable, then converted to a nonactivating panel. It cannot become a key or main window.
- Removed `PanelBuilder.no_activate(true)`. The pinned `tauri-nspanel` implementation temporarily changes the **whole application's** activation policy to `Prohibited` during creation. The dock now leaves that policy alone.
- Tauri's existing show/resize path remains in use so WebKit resumes correctly.
- Appearance uses five actual companion previews in one horizontal radio gallery, with saved selection, visible focus, arrow-key selection, and focus restoration after persistence.

## Native checks

Used the isolated **Say Less Dev** bundle and its own settings. Microphone, camera, screen recording, and Accessibility permissions were not granted to the test build.

- First Home → Show floating dock kept Home visible.
- Appearance → Show floating dock off/on kept Appearance visible.
- Chose the last gallery card, Your avatar; WebKit scrolled the card into view and saved the choice.
- Closed the main window to inspect the actual floating panel. It showed the selected avatar.
- Clicked the avatar to expand the dock. Its controls appeared.
- Used the dock's Open settings control to reopen the main window.

The debug build's initial WebKit process terminated before first-run UI appeared. Cmd+R restored it, after which the checks above were performed. This is separate from the reported Show floating dock symptom.

## Automated checks

- 48 Playwright tests covering the gallery, dock, companion and voice visuals passed.
- Gallery tests cover 390, 680 and 1200 pixel widths in light/dark themes, one-row layout, contained horizontal scrolling, persistence, keyboard selection and save errors.
- All gallery previews are paused, preventing five additional animated previews.
- Frontend build, ESLint, formatting and translation-key checks passed.
- Native Dev build and cargo clippy passed; clippy reports existing warnings.

## Remaining acceptance

The reported disappearance was **not reproduced** in installed v0.14.10, including a fresh process with the floating dock initially off. The native change removes a confirmed application-wide policy mutation, but its relationship to the user's exact symptom is not yet proven. Confirm which windows disappear and retest that exact sequence before calling the reported issue conclusively fixed.

These changes have not been published or installed as a customer update. The installed application remains v0.14.10.
