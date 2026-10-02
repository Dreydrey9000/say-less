#!/usr/bin/env bash
# Deploy the bridge from this repo into its runtime folder and (re)load the
# LaunchAgent. Safe to run again. This is the ONLY way the bridge should be
# updated: the repo's bridge/ folder is the single copy of the code, the
# runtime folder holds config.json and state/ (your settings and registries).
#
#   bash bridge/install.sh
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
RUNTIME="${SAYLESS_BRIDGE_HOME:-$HOME/Desktop/_Code/say-less-bridge}"
LABEL="com.luis.say-less-bridge"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
PY="$(command -v python3)"

mkdir -p "$RUNTIME/state" "$RUNTIME/extras"
for f in bridge.py title-ideas images recordings bridge-bucket; do
  install -m 0755 "$SRC/$f" "$RUNTIME/$f"
done
install -m 0644 "$SRC/studio.py" "$RUNTIME/studio.py"
rm -rf "$RUNTIME/ui" && cp -R "$SRC/ui" "$RUNTIME/ui"
cp "$SRC/config.example.json" "$RUNTIME/config.example.json"
cp "$SRC/extras/"* "$RUNTIME/extras/"
[ -f "$RUNTIME/config.json" ] || cp "$SRC/config.example.json" "$RUNTIME/config.json"

sed -e "s#__BRIDGE_HOME__#$RUNTIME#g" -e "s#__PYTHON__#$PY#g" \
  "$SRC/extras/com.luis.say-less-bridge.plist.template" > "$PLIST"
plutil -lint "$PLIST" >/dev/null

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
for _ in 1 2 3 4 5 6 7 8 9 10; do   # let the old copy exit before starting the new one
  pgrep -f "$RUNTIME/bridge.py" >/dev/null || break
  sleep 1
done
launchctl bootstrap "gui/$(id -u)" "$PLIST"

for _ in $(seq 1 25); do
  PORT="$(cat "$RUNTIME/state/port.txt" 2>/dev/null || true)"
  if [ -n "$PORT" ] && curl -fs -m 3 "http://127.0.0.1:$PORT/health" >/dev/null; then
    echo "Say Less Studio: http://127.0.0.1:$PORT/app"
    echo "bridge is up on port $PORT:"
    curl -s -m 3 "http://127.0.0.1:$PORT/health"; echo
    exit 0
  fi
  sleep 1
done
echo "bridge did not answer; see $RUNTIME/state/bridge.log and launchd.err.log" >&2
exit 1
