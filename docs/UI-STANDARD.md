# Say Less interface checks

Keep the silver emblem and controls, semantic light/dark colors, native form semantics, visible focus, readable labels, and reduced-motion support.

Run `bun run build`, `bun run lint`, `bun run check:translations`, `bun run test:playwright`, and formatting checks for interface changes. The existing Playwright workflow runs these UI tests on relevant pull requests. `tests/writing.spec.ts` is the minimum regression baseline for the new Writing page and shared controls; do not weaken it to admit new regressions.

The test fixture renders the real React application with simulated desktop IPC. It uses synthetic data, never grants permissions, and is excluded from the production build. Rust tests verify the real snippet matcher separately. Passing renderer tests does not establish macOS microphone, Accessibility, clipboard, or model behavior.

Verify native screens after rebuilding. Test at desktop and narrow widths, light/dark themes, keyboard-only navigation, increased text/zoom, errors, empty states, disabled/pending actions, and reduced motion. OS permission changes remain explicit user actions. Product updates belong in the in-app What's New archive; engineering details belong in the changelog.
