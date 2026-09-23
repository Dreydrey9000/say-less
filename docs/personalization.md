# Personalize Say Less and bring your Wispr library

## Appearance and floating dock

Open **Appearance**. Choose a preset or enter a six-digit hex color, then Apply color. Accent fills choose black or white foreground text for contrast; normal text keeps the light/dark theme palette. The recording overlay and floating dock receive live color changes.

Show dock creates a separate always-on-top window. On macOS it is a nonactivating NSPanel, so Record does not become the paste destination. Drag its grip; X hides it and saves that preference. Dock visibility survives restart; its position currently resets to the initial location. Recording status follows backend events. OS microphone and Accessibility permissions are still required.

## Voice actions

Add a specific installed `.app` from Applications/System Applications or an http/https website. Save a cue without the “Say Less” prefix, and enable Voice actions. Dictate **Say Less, open notes** for a cue named **open notes**.

Only an exact, whole-utterance match against the original recognized transcript runs. Snippet expansions and AI output cannot run actions. Websites cannot contain embedded credentials or executable URL schemes. Apps must resolve inside approved local Applications folders. This does not execute shell scripts, send messages, purchase anything, or perform arbitrary desktop automation. A failed configured action shows an error and does not paste its cue.

## Writing styles

The default and app-specific rules operate locally: keep original, sentence case plus final punctuation, remove trailing periods, or lowercase. App rules match the foreground macOS app name when output is processed (for example, Mail or Slack). Browser websites share their browser's app rule. This is deterministic formatting, not Flow's contextual tone model, backtracking, or selected-text Command Mode. Saved snippet formatting is protected.

## Wispr import

**Find Wispr on this Mac** opens the known local `flow.sqlite` read-only and previews nondeleted dictionary entries. Supported schema: Dictionary with phrase, replacement, isSnippet, isDeleted and modifiedAt. Missing/incompatible schemas fail visibly. No credentials or session files are read.

- Words without replacements become Say Less custom vocabulary.
- Snippets and explicit misspelling replacements become exact local phrase replacements.
- Existing words/cues win; invalid and duplicate entries are skipped. Up to 1,000 total saved snippets.
- A preview fingerprint must match at apply time. If the source/library changes, scan again.
- The first import retains a local `wispr-import-backup.json` snapshot. It is not a UI Undo feature; keep it for recovery.
- History is separately opt-in: up to 50,000 newest records, capped at 100 MB of text. Best available edited/formatted/raw text and timestamps go into `wispr-history.sqlite`, with source IDs for repeat-import deduplication. Browse in pages of 50. No audio, screenshots, context, or meeting data.
- Library and history have separate completion counts. History failure is reported even if the library import succeeds.
- Account settings, hotkeys, style preferences, cloud/team permissions, and rich text are not migrated. Review/recreate corresponding settings in Say Less. Nothing modifies Wispr.

You can also choose a Wispr-format JSON array of `{ "name": "cue", "text": "expansion" }` objects or CSV with vocabulary in one column, or incorrect/correct phrases in two columns. Files are limited to 3 MB and 1,000 entries. Quoted commas, escaped quotes, and multiline CSV fields are supported. This follows [Wispr's documented import formats](https://docs.wisprflow.ai/articles/8955301725-How-Do-I-Bulk-Import-Dictionary-Items-and-Snippets); it does not assume Wispr offers a one-click export of all account data.

## Recover Accessibility after an update

If Say Less reports missing Accessibility even though its macOS switch is on, remove only Say Less from **System Settings → Privacy & Security → Accessibility**, then add `/Applications/Say Less.app` again and enable it. Return to Say Less and select **Check again**. The app also checks when its window regains focus. Waiting ends after 15 seconds so a denied or stale grant never leaves the button permanently unavailable. Only macOS can grant this permission; the app never treats a timeout as permission.

## Build and distribution

The local Mac has an Apple Development signing identity. Use a consistent local identity for successive builds to avoid ad-hoc code-hash permission churn. Transitioning from ad-hoc to certificate signing may require reauthorization once. Do not copy identities/private keys into this repo. Developer ID distribution signing, notarization, installer testing, and update signing remain release work.

[Architecture](diagrams/personalization.mmd) · [Capability comparison](wispr-comparison.md)
