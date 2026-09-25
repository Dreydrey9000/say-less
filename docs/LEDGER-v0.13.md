# v0.13 build ledger (started 2026-09-24)

Goal: ship v0.13 = voice visuals (squiggle + talking avatar + builder) + Stress Less (recurring problems/ideas, digest, read-aloud, nightly notes export, local MCP) + share flow + site update, as a signed release on saylessvoice.com.
Branches: feat/voice-visuals (builder A, ~/worktrees/say-less/voice-visuals), feat/stress-less (builder B, ~/worktrees/say-less/stress-less). Integrator: main checkout.
Constraints: no new dependencies; no local Playwright/headless (Drey RAM rule, CI runs it); local-first + opt-in for anything touching history; flat SVG/CSS only; every user-visible change gets an in-app release note + CHANGELOG line.
TestFlight: not applicable (Mac App Store sandbox blocks typing into other apps). Distribution = signed GitHub release + saylessvoice.com.
Blocked on Drey: finish scripts/setup-apple-signing.sh (Apple ID email + app-specific password).
Status (2026-09-25 ~03:45 UTC): [x] A [x] B [x] share+site(committed, not deployed) [x] Fn key [x] merge PR #1 -> main aaaa23b [x] CI green (53/53 PW, rust, nix, quality) [ ] release v0.13.0 draft (run 36091651483) [ ] Apple signing secrets (Drey) [ ] signed rebuild [ ] site deploy + DOWNLOADS [ ] Drey publishes
Local: v0.13.0 installed in /Applications (ad-hoc, built from 2d00b64); v0.12 backup in nemotron-streaming/src-tauri/target/installed-backups/Say Less-0.12.0-pre013.app. Drey must re-grant Accessibility.
Gotcha: PATH xattr (~/Library/Python/3.9/bin) lacks -r, breaks local tauri bundling; use /usr/bin/xattr -cr then codesign -s - manually.
