# Changelog

## [2026-09-18]
### Added
- Forked Handy v0.9.7 as Say Less, a free offline dictation app for the coaching group.
### Changed
- App name, bundle ID (`com.dreythomas.sayless`), and English UI text renamed to Say Less so it installs separately from Handy.
- Auto-update feed now points at this repo's releases, not Handy's. Otherwise installs would "update" into Handy.
### Removed
- Handy's Windows code-signing command, which uses CJ's Azure account and would break our builds.
