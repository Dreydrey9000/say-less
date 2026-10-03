#!/usr/bin/env bash
# One Say Less on this Mac.
#
# macOS keeps a list of every app bundle it has ever seen. A local build, a
# downloaded zip or a test copy that shares Say Less's bundle id
# (com.dreythomas.sayless) lands on that list, and then Spotlight, the Dock,
# the updater and "open" can pick the wrong copy.
#
#   bash scripts/one-copy.sh          # show every registered copy (changes nothing)
#   bash scripts/one-copy.sh --fix    # forget every copy except /Applications/Say Less.app
set -euo pipefail

LSR=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
KEEP="/Applications/Say Less.app"
ID="com.dreythomas.sayless"

copies=$("$LSR" -dump 2>/dev/null | awk -v id="$ID" '/^path:/{p=$0} $0 ~ "identifier:[[:space:]]+" id "$" {print p}' \
  | sed -e 's/^path:[[:space:]]*//' -e 's/ (0x[0-9a-f]*)$//' | sort -u)

echo "Say Less copies macOS knows about:"
echo "$copies" | sed 's/^/  /'
strays=$(echo "$copies" | grep -v -x -F "$KEEP" || true)

if [ -z "$strays" ]; then echo "Only the installed copy. Nothing to do."; exit 0; fi
if [ "${1:-}" != "--fix" ]; then
  echo; echo "Stray copies found. Run with --fix to forget them (the files are not deleted)."; exit 1
fi

# Undo list, so this is reversible
undo="$HOME/.claude/backups/say-less-one-copy-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$undo"; echo "$copies" > "$undo/registered-before.txt"
while IFS= read -r p; do
  [ -z "$p" ] && continue
  "$LSR" -u "$p" && echo "forgot: $p"
done <<< "$strays"
echo "Undo list saved in $undo (re-register a path with: $LSR -f <path>)"
