# v0.13 build ledger (started 2026-09-24)

Goal: ship v0.13 = voice visuals (squiggle + talking avatar + builder) + Stress Less (recurring problems/ideas, digest, read-aloud, nightly notes export, local MCP) + share flow + site update, as a signed release on saylessvoice.com.
Branches: feat/voice-visuals (builder A, ~/worktrees/say-less/voice-visuals), feat/stress-less (builder B, ~/worktrees/say-less/stress-less). Integrator: main checkout.
Constraints: no new dependencies; no local Playwright/headless (Drey RAM rule, CI runs it); local-first + opt-in for anything touching history; flat SVG/CSS only; every user-visible change gets an in-app release note + CHANGELOG line.
TestFlight: not applicable (Mac App Store sandbox blocks typing into other apps). Distribution = signed GitHub release + saylessvoice.com.
Blocked on Drey: finish scripts/setup-apple-signing.sh (Apple ID email + app-specific password).
Status: [ ] A [ ] B [ ] share+site [ ] merge [ ] CI green [ ] signed release [ ] site buttons live
