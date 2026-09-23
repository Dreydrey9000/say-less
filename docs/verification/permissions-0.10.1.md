# Permission recovery — 0.10.1

The installed 0.10.0 app reported Microphone granted and Accessibility denied while System Settings displayed Say Less as enabled. A stale entry after the earlier signing change remains the likely OS cause, not a confirmed TCC diagnosis. No permissions were silently granted or reset.

Fixed the indefinite Waiting state: polling ends after 15 seconds, errors restore request controls, Check again stays available, and focus rechecks the actual OS result. Stabilized the completion callback and guarded repeated completion to prevent an initialization loop after a successful grant.

Verification: 29 Playwright tests passed, including externally granted access via focus and retry, continued denial after timeout, and keyboard/overflow checks at 390 and 1200 pixels. Frontend build, lint, translation-key and formatting checks passed. These mocks establish UI behavior, not an actual macOS grant or live dictation. Native permission recovery still requires the user to refresh the OS entry.

Installed 0.10.1 with the existing Apple Development identity; strict code-signature verification passed. Native UI shows Microphone Granted, recovery instructions and Check again. Clicking Check again keeps the denied state and remains responsive. Accessibility is still not granted to the running app.
