# QuickSilver: lazy interface translations

QuickSilver's HTTP runner cannot time Say Less's native microphone and model path. This pass measured one representative product path instead: the compact dock becoming interactive in a production-built Chromium fixture with mocked Tauri IPC. It is a startup comparison, not a native-app latency claim.

## One bottleneck

`src/i18n/index.ts` eagerly imported every translation JSON. Those files total about 1.8 MB of source and made the shared startup script 543,473 bytes gzipped in the measured fixture. The dock needed only English on the tested launch.

The change keeps English in the startup bundle and loads another language when the saved setting or language selector requests it. A failed load keeps the current language and does not save the selection.

## Before and after

Both runs used the same production-build fixture, Vite preview server on localhost, 60 fresh Chromium contexts each, and the same mocked dock settings. The fixture build targets modern Chromium to support its test-only top-level `await`. Ready means the compact emblem is enabled, sampled inside the page with `performance.now()` on animation frames. This isolates frontend startup and omits native window, microphone, model, and paste costs.

| Measure                             |    Before |    After |      Change |
| ----------------------------------- | --------: | -------: | ----------: |
| Dock ready median                   |   89.6 ms |  58.2 ms |  35% faster |
| Dock ready p95                      |  149.4 ms |  79.9 ms |  47% faster |
| Largest shared startup script, gzip | 543,473 B | 35,150 B | 94% smaller |

The individual samples and asset inventories are in the [before](data/quicksilver-locales-before.json) and [after](data/quicksilver-locales-after.json) JSON. This result clears QuickSilver's 10% keep threshold. It has not been measured in an installed Mac app.

## Repeat the measurement

Build the fixture with `bun vite build --config vite.perf.config.ts`, serve it with `bun vite preview --host 127.0.0.1 --port 4190`, then run `bun scripts/quicksilver-dock-probe.ts candidate /tmp/say-less-candidate.json http://127.0.0.1:4190 60` in a separate terminal. Use the same machine and build settings for both sides of a comparison.

[Editable localization flow](../diagrams/localization.mmd)
