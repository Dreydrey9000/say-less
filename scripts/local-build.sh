#!/usr/bin/env bash
# Build a local test copy of Say Less that can never collide with the installed one.
#
# It is called "Say Less Dev", has its own bundle id (com.dreythomas.sayless.dev),
# its own settings and its own macOS permissions. Never copy it over
# /Applications/Say Less.app: that is what breaks the Accessibility permission.
set -euo pipefail
cd "$(dirname "$0")/.."

# Homebrew's `xattr` shadows the system one and makes the bundling step fail.
export PATH="/usr/bin:$PATH"
export CMAKE_POLICY_VERSION_MINIMUM=3.5

bun run tauri build --debug --bundles app --config src-tauri/tauri.dev-build.conf.json
APP="src-tauri/target/debug/bundle/macos/Say Less Dev.app"
/usr/bin/xattr -crs "$APP"
codesign --force --deep -s - "$APP"
echo "Built: $APP"
echo "Open it with:  open -n \"$APP\""
