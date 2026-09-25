# Changelog

## [2026-09-25]

### Changed

- Squiggle rebuilt as three phase-offset strands (the front one in the accent with a silver core and soft glow) over a fading baseline, 84x24 in the overlay, because the single thin line read as cheap and an idle pill looked empty.
- Squiggle loudness now drives a spring with a small overshoot and a slow swell along its length, so talking reads as smooth motion instead of jumps; still one animation-frame loop writing paths directly, stopped when motion is off or the window is hidden.
- Squiggle follows the chosen accent color in the overlay and in Appearance (it used the logo pink), and Reduce Motion or Pause draws a fixed, full resting shape.
- Talking avatar: one persistent mouth path with a tongue that morphs by opening (no more pop between a line and an oval), eyelid blinks on a random 2.2 to 5.4 second timer, slight pupil drift, breathing while listening, a glance up while thinking, squash-and-bounce on start and a happy squint on stop, and faint voice rings (one in the small pill); all spring-eased and all still under Reduce Motion or Pause.
- Companion picker: Orbit, Helix, Wave and Chrome S are now four distinct silver silhouettes on a charcoal lens (tilted orbit with beads passing behind and in front, a turning double helix, flowing sine ribbons, and the real S emblem with a bezel glint), with the accent only as glow or rim light; the flat radial ball became a layered chrome orb (dark core, accent inner glow, specular highlight, thin bright rim, brushed grain).
- Picker cards: the chosen card gets a check badge next to its ring, and only the chosen, hovered or focused card animates, to keep the settings page light.
- Compact dock disc has depth (inner shadow, specular top rim) and its status dot now means state: neutral gray when idle, bright while transcribing, amber on error, instead of copying the accent.
- Recording overlay is a recessed charcoal pill in both themes (hairline ring, top highlight, inner shadow, no outer shadow so nothing clips at the window edge), with its text and hairlines pinned to the dark palette.
- Voice visual samples in Appearance sit in the same charcoal pill, so they preview the real overlay.

### Added

- Playwright checks for the three squiggle strands, the still squiggle under Reduce Motion, a single morphing avatar mouth, the single ring in the small pill, distinct companion cards with only the chosen one animating, and the neutral idle dot in the compact dock.
- In-app release note 0.13.1 describing the polish; it shows once the app version reaches 0.13.1.

### Fixed

- Insights, history search, notes export and `--mcp` now read imported Wispr Flow history (`wispr-history.sqlite`) alongside `history.db`, because a new user who imported months of Wispr dictations saw "Not enough history yet"; a missing, damaged or locked import file is skipped and logged instead of breaking Insights.

## [2026-09-24]

### Added

- Hold Fn (Globe) to talk on Mac, like Wispr Flow, alongside Option+Space; it is a second default shortcut, so existing installs get it on update and either key works.
- Share Say Less button in About that copies saylessvoice.com, so members can pass the app on in one tap.
- Voice visuals: choose Bars, Squiggle, or Avatar for the recording overlay in Appearance, so the overlay can match your style; Bars stays the default so nothing changes until you pick.
- Talking avatar (stick figure, person, cat, dog; three colors; cap, beanie, crown, headphones, sunglasses) whose mouth follows voice volume, usable as the dock companion and the overlay; volume-driven because real lip-sync needs a second live model.
- Avatar builder with a live preview and a Test button that plays a short speaking rhythm, so you can check the look without recording.
- `overlay_visual` and `avatar` settings in `studio.json`, validated in Rust (known styles/accessories, hex colors only) so a bad value can't reach the SVG.
- Playwright coverage for the builder, reduced motion, overlay squiggle/avatar, and the 104px compact dock; the test fixture can now render the recording overlay with mocked events.
- Voice visuals diagram (`docs/diagrams/voice-visuals.mmd` + `.svg`) and a Voice visuals section in `docs/personalization.md`.
- Insights ("Say less, stress less"): recurring problems, recurring ideas, and "Fix this first," with dated quotes, computed locally from dictation history with no model, so people see what keeps coming up without anything leaving their computer.
- Search across all dictations from the Insights screen, because finding "what did I say about X" should not mean scrolling history.
- Opt-in "Summarize with AI" digest that reuses the Post Process provider and sends only topic labels, counts and up to two short quotes per topic; nothing runs automatically.
- "Read digest aloud" using the system's built-in voices (no download, works offline).
- Opt-in Obsidian-friendly notes export (daily notes + Insights.md with wikilinks), nightly or on demand; it only writes files it created and never deletes, so a notes vault stays safe.
- `--mcp` flag: a local, read-only MCP server (search_transcripts, recent_transcripts, recurring_topics) so Claude and other MCP apps can answer questions about your own history; it never starts the app, tray, or microphone.
- docs/stress-less.md and a data-flow diagram showing exactly what stays local and what is opt-in.
- Download site in `site/` (live at say-less-dhi.pages.dev), with "coming soon" buttons until the first signed release exists.
- Our own auto-update signing key. Private key lives in GitHub secrets; the old Handy public key could never verify our updates.

### Fixed

- Regenerated the updater signing key with a real password; the first key was created without one, which let anyone holding the file sign updates and made CI fail with a password mismatch.
- macOS CI builds no longer fail when no Apple Developer ID certificate is uploaded; they build unsigned (ad-hoc) instead.
- Tauri treated a blank APPLE_CERTIFICATE as a real one; macOS now builds through a separate unsigned step with no Apple variables until a cert is uploaded.

### Security

- PR Test Build and Build Test no longer receive signing secrets; only main and release builds sign.
- `.gitignore` now blocks `.env*`, certificates/keys, and wrangler state.
- Added `SECURITY.md` with a private reporting link.
- Removed a local home-folder path and personal dictionary/library details from docs before the repo went public.

### Changed

- Release builds are Mac + Windows only; Linux packages still carried Handy's install path and maintainer.
- Installers now include the MIT license file (required by Handy's license) and list Drey Thomas as publisher.
- Issue/PR templates and CONTRIBUTING point at Say Less instead of Handy; removed Handy's donation links (FUNDING.yml).
- Site: live on saylessvoice.com; replaced unverified claims (8GB auto-model picking, Windows availability) with accurate copy; FAQ says models download once from Handy's model server.
- Release asset prefix renamed from `handy` to `say-less`.
- `scripts/setup-apple-signing.sh` walks through uploading the Developer ID certificate and notarization login to GitHub secrets.
- Companion motion checks (Pause, Reduce Motion, hidden window) moved into a shared `useMotionAllowed` hook so the dock, overlay, and Appearance preview all stop decorative motion the same way.

## 0.10.1

- Recover from stalled macOS permission setup with bounded waiting, focus rechecks, and explicit retry instructions.

## 0.10.0

- Custom accent palettes and a nonactivating floating dock.
- Exact, opt-in voice cues for installed Mac apps and http/https links.
- Local per-app casing/punctuation styles.
- Read-only Wispr library preview/import, CSV/JSON support, optional text history archive, deduplication and pre-import backup.
- Recheck existing permissions when returning from System Settings.

## Unreleased

- Added local voice snippets with durable save, edit/remove, duplicate validation, whole-cue and in-sentence matching, and a preview using the same Rust matcher. Matching snippets bypass optional AI cleanup to preserve their saved text.
- Added Writing for vocabulary, filler cleanup, and snippets; replaced custom dropdown menus with native selectors, named switches, keyboard focus, responsive settings rows, and shared silver actions.
- Fixed rejected settings appearing saved; rollback now preserves concurrent changes to other settings. Failed dictionary saves retain the draft.
- Added permission-free settings browsing without starting input simulation or shortcuts, plus a persistent setup notice. First-time users now receive the latest useful in-app introduction.
- Added real renderer workflow tests with simulated desktop IPC and a sourced Wispr Flow gap analysis. This is not a full parity or distribution claim.
- Added Say Less's silver speech emblem, native app icons, monochrome tray states, and a reusable coaching-portal brand asset.
- Replaced inherited product names in the native window, tray tooltip, HTML title, and translated screens. Preserved upstream project attribution and compatibility identifiers.
- Added the 0.9.8 in-app introduction, neutral theme, accessible sidebar buttons, and silver permission controls.
- Fixed Finder launch of packaged debug builds: TypeScript bindings are exported only during development, to the source directory rather than the current working directory.
- Fixed recognition of Hugging Face models downloaded by commit SHA without a `refs` entry, including Nemotron downloaded with the official HF CLI. Existing `main` cache fallback remains available.
- Added a reproducible Nemotron acceptance check using the existing pinned runtime and model catalog, covering integrity, partial transcripts, finalization, repeat sessions, automatic language selection, and cancellation recovery.
- Documented the existing optional Nemotron setup and local dictation architecture.
- Corrected distribution status and clarified that optional cloud post-processing sends transcript text to a configured provider.

## [2026-09-18]

### Added

- Forked Handy v0.9.7 as Say Less, a free offline dictation app for the coaching group.

### Changed

- App name, bundle ID (`com.dreythomas.sayless`), and English UI text renamed to Say Less so it installs separately from Handy.
- Auto-update feed now points at this repo's releases, not Handy's. Otherwise installs would "update" into Handy.

### Removed

- Handy's Windows code-signing command, which uses CJ's Azure account and would break our builds.
