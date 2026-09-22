# Changelog

## Unreleased

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
