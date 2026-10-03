#!/usr/bin/env bash
# Build the four Say Less launcher apps from one compiled Swift WKWebView shell.
#
# Usage: bash bridge/launcher/build-launchers.sh [--out DIR] [--install]
#   --out DIR    where the .app bundles are built (default /tmp/sayless-launchers)
#   --install    move any existing /Applications/<Name>.app to
#                ~/.claude/backups/say-less-launchers-<timestamp>/ (never deleted),
#                copy the new one in, and register it with LaunchServices.
# Without --install nothing under /Applications is touched.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="/tmp/sayless-launchers"
INSTALL=0
STATE_DIR="${SAYLESS_BRIDGE_HOME:-$HOME/Desktop/_Code/say-less-bridge}/state"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
VERSION="1.0.0"

while [ $# -gt 0 ]; do
  case "$1" in
    --out) OUT="${2:?--out needs a directory}"; shift 2 ;;
    --install) INSTALL=1; shift ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "build-launchers: unknown argument: $1" >&2; exit 2 ;;
  esac
done
case "$OUT" in /*) ;; *) OUT="$PWD/$OUT" ;; esac

# name | bundle id | icon slug | start url | width | height
APPS=(
  "Title Ideas|com.luis.sayless.titleideas|titleideas|http://127.0.0.1:8810/app#/titles|1040|760"
  "Say Less Image|com.luis.sayless.image|image|http://127.0.0.1:8810/app#/image|1180|820"
  "Say Less Recordings|com.luis.sayless.recordings|recordings|http://127.0.0.1:8810/app#/recordings|1100|780"
  "Read Screens|com.luis.sayless.screens|screens|http://127.0.0.1:8810/app#/screens|1040|760"
)

mkdir -p "$OUT"
WORK="$OUT/.work"
rm -rf "$WORK"
mkdir -p "$WORK/icons"

echo "==> compiling shell"
/usr/bin/swiftc -O -swift-version 5 -target arm64-apple-macos13.0 -parse-as-library \
  "$HERE/SayLessLauncher.swift" -o "$WORK/SayLessLauncher"

echo "==> drawing icons"
python3 "$HERE/make_icons.py" --out "$WORK/icons"

for row in "${APPS[@]}"; do
  IFS='|' read -r NAME BID SLUG URL W H <<<"$row"
  APP="$OUT/$NAME.app"
  echo "==> packaging $NAME"
  rm -rf "$APP"
  mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
  cp "$WORK/SayLessLauncher" "$APP/Contents/MacOS/SayLessLauncher"
  cp "$WORK/icons/$SLUG.icns" "$APP/Contents/Resources/AppIcon.icns"
  cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>$NAME</string>
  <key>CFBundleDisplayName</key><string>$NAME</string>
  <key>CFBundleIdentifier</key><string>$BID</string>
  <key>CFBundleExecutable</key><string>SayLessLauncher</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>LSUIElement</key><false/>
  <key>NSPrincipalClass</key><string>NSApplication</string>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsLocalNetworking</key><true/>
    <key>NSExceptionDomains</key>
    <dict>
      <key>127.0.0.1</key><dict><key>NSExceptionAllowsInsecureHTTPLoads</key><true/></dict>
      <key>localhost</key><dict><key>NSExceptionAllowsInsecureHTTPLoads</key><true/></dict>
    </dict>
  </dict>
  <key>SLStartURL</key><string>$URL</string>
  <key>SLWindowWidth</key><integer>$W</integer>
  <key>SLWindowHeight</key><integer>$H</integer>
  <key>SLStateDir</key><string>$STATE_DIR</string>
</dict>
</plist>
PLIST
  plutil -lint "$APP/Contents/Info.plist" >/dev/null
  /usr/bin/xattr -crs "$APP"
  codesign --force --deep -s - "$APP" >/dev/null 2>&1
  codesign --verify --deep --strict "$APP"
  echo "    ok: $APP"
done

# Keep the 1024 masters next to the apps for review.
mkdir -p "$OUT/icons"
cp "$WORK"/icons/*-1024.png "$OUT/icons/"
rm -rf "$WORK"

if [ "$INSTALL" -eq 1 ]; then
  STAMP="$(date +%Y%m%d-%H%M%S)"
  BACKUP="$HOME/.claude/backups/say-less-launchers-$STAMP"
  echo "==> installing to /Applications (backups in $BACKUP)"
  for row in "${APPS[@]}"; do
    IFS='|' read -r NAME _ _ _ _ _ <<<"$row"
    DEST="/Applications/$NAME.app"
    if [ -e "$DEST" ]; then
      mkdir -p "$BACKUP"
      mv "$DEST" "$BACKUP/"
      echo "    moved old $NAME.app to backup"
    fi
    cp -R "$OUT/$NAME.app" "$DEST"
    /usr/bin/xattr -crs "$DEST"
    "$LSREGISTER" -f "$DEST"
    echo "    installed $DEST"
  done
else
  echo "==> built only (no --install): /Applications untouched"
fi
echo "done: $OUT"
