#!/usr/bin/env bash
# Say Less says "Accessibility: Allow" even though it is switched on?
#
# macOS remembers the permission for ONE exact build of the app. A different
# build with the same bundle id (a local test build, or an update that was
# installed over one) leaves a stale row in System Settings that LOOKS on but
# does not match the app you are running. Adding it again does not clear it.
# Resetting the row does. YOU run this: it changes a privacy setting.
#
#   bash scripts/fix-permissions.sh          # Accessibility only (typing into other apps)
#   bash scripts/fix-permissions.sh --all    # also Input Monitoring and Screen Recording
set -euo pipefail
ID="com.dreythomas.sayless"

osascript -e 'tell application "Say Less" to quit' 2>/dev/null || true
sleep 2
tccutil reset Accessibility "$ID"
if [ "${1:-}" = "--all" ]; then
  tccutil reset ListenEvent "$ID"
  tccutil reset ScreenCapture "$ID"
fi
open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
open -a "/Applications/Say Less.app"
cat <<'MSG'

Done. Now, once:
  1. In Say Less, click Allow next to Accessibility.
  2. In System Settings, switch Say Less ON.
It stays on from now on, as long as updates come from the official Say Less
release and you never copy a local test build over /Applications/Say Less.app.
MSG
