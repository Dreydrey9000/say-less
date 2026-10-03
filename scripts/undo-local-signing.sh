#!/usr/bin/env bash
# Reverse scripts/setup-local-signing.sh.
#
# Deletes the dedicated Say Less Local Dev keychain and takes it off the
# user keychain search list. Does not modify login.keychain-db, the system
# keychain, TCC, or /Applications/Say Less.app.
#
# After this, the next local build creates a new certificate. macOS will
# ask for Accessibility once for that new identity.
set -euo pipefail

KEYCHAIN="${HOME}/Library/Keychains/say-less-local-dev.keychain-db"
STATE="${HOME}/Library/Application Support/Say Less Dev/signing"
LOGIN_KEYCHAIN="${HOME}/Library/Keychains/login.keychain-db"

list_keychains() {
  /usr/bin/security list-keychains -d user |
    /usr/bin/sed -E 's/^[[:space:]]+//; s/^"//; s/"$//'
}

echo "Search list before undo:"
list_keychains

keep=()
line=""
while IFS= read -r line; do
  [ -n "$line" ] || continue
  [ "$line" = "$KEYCHAIN" ] && continue
  keep+=("$line")
done < <(list_keychains)

if [ "${#keep[@]}" -eq 0 ]; then
  # Never leave the search list empty.
  /usr/bin/security list-keychains -d user -s "$LOGIN_KEYCHAIN"
else
  /usr/bin/security list-keychains -d user -s "${keep[@]}"
fi

if [ -f "${STATE}/default-keychain-before.txt" ]; then
  previous="$(/bin/cat "${STATE}/default-keychain-before.txt")"
  if [ -n "$previous" ] && [ -f "$previous" ]; then
    /usr/bin/security default-keychain -s "$previous"
  fi
fi

if [ -f "$KEYCHAIN" ]; then
  /usr/bin/security delete-keychain "$KEYCHAIN"
  echo "Deleted keychain: ${KEYCHAIN}"
else
  echo "No keychain file at ${KEYCHAIN}"
fi

# The state dir holds only this identity's password, public cert, and notes.
if [ -d "$STATE" ]; then
  rm -rf "$STATE"
  echo "Deleted ${STATE}"
fi

echo "Search list after undo:"
list_keychains
echo "Login keychain was not modified: ${LOGIN_KEYCHAIN}"
