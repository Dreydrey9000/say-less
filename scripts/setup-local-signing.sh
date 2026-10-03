#!/usr/bin/env bash
# Create the "Say Less Local Dev" code-signing identity, once.
#
# Ad-hoc signatures (codesign -s -) put the cdhash in the designated
# requirement, so macOS treats every rebuild as a different app and asks for
# Accessibility again. A self-signed certificate keeps that requirement stable.
#
# Nothing here touches the login keychain's contents, the system keychain,
# TCC, or /Applications/Say Less.app. The certificate lives in its own
# keychain. Undo with: bash scripts/undo-local-signing.sh
set -euo pipefail

IDENTITY="Say Less Local Dev"
KEYCHAIN="${HOME}/Library/Keychains/say-less-local-dev.keychain-db"
STATE="${HOME}/Library/Application Support/Say Less Dev/signing"
PASS_FILE="${STATE}/keychain.password"
MARKER="${STATE}/CREATED"
LOGIN_KEYCHAIN="${HOME}/Library/Keychains/login.keychain-db"

list_keychains() {
  /usr/bin/security list-keychains -d user |
    /usr/bin/sed -E 's/^[[:space:]]+//; s/^"//; s/"$//'
}

default_keychain() {
  /usr/bin/security default-keychain -d user |
    /usr/bin/sed -E 's/^[[:space:]]+//; s/^"//; s/"$//'
}

# find-identity -p codesigning only lists trusted (Apple-issued) identities.
# A self-signed certificate stays at "0 valid identities" and still signs.
# The certificate's presence is the check; codesign is the proof.
identity_ready() {
  /usr/bin/security find-certificate -c "$IDENTITY" "$KEYCHAIN" >/dev/null 2>&1
}

add_to_search_list() {
  local kc="$1"
  local existing=()
  local line
  while IFS= read -r line; do
    [ -n "$line" ] && existing+=("$line")
  done < <(list_keychains)
  local k
  for k in "${existing[@]}"; do
    if [ "$k" = "$kc" ]; then
      return 0
    fi
  done
  /usr/bin/security list-keychains -d user -s "$kc" "${existing[@]}"
}

mkdir -p "$STATE"
chmod 700 "$STATE"

# Record the search list and default keychain the first time we run, before
# create-keychain gets a chance to change either one.
if [ ! -f "${STATE}/search-list-before.txt" ]; then
  list_keychains >"${STATE}/search-list-before.txt"
fi
if [ ! -f "${STATE}/default-keychain-before.txt" ]; then
  default_keychain >"${STATE}/default-keychain-before.txt"
fi

if [ ! -f "$PASS_FILE" ]; then
  /usr/bin/openssl rand -hex 24 >"$PASS_FILE"
  chmod 600 "$PASS_FILE"
fi
PASS="$(/bin/cat "$PASS_FILE")"

if [ -f "$KEYCHAIN" ]; then
  /usr/bin/security unlock-keychain -p "$PASS" "$KEYCHAIN"
fi

if [ -f "$KEYCHAIN" ] && identity_ready; then
  :
else
  if [ -f "$KEYCHAIN" ]; then
    echo "Say Less local keychain exists but has no \"${IDENTITY}\" identity." >&2
    echo "Refusing to mint a second certificate. Run scripts/undo-local-signing.sh first." >&2
    exit 1
  fi

  work="$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/sayless-signing.XXXXXX")"
  chmod 700 "$work"
  trap 'rm -rf "$work"' EXIT

  # LibreSSL accepts -addext. codeSigning EKU is what makes find-identity
  # -p codesigning list this certificate.
  /usr/bin/openssl req -new -newkey rsa:2048 -x509 -nodes -days 3650 \
    -subj "/CN=${IDENTITY}" \
    -addext "basicConstraints=critical,CA:FALSE" \
    -addext "keyUsage=critical,digitalSignature" \
    -addext "extendedKeyUsage=critical,codeSigning" \
    -keyout "${work}/key.pem" -out "${work}/cert.pem" >/dev/null 2>&1
  /bin/cp "${work}/cert.pem" "${STATE}/cert.pem"
  chmod 644 "${STATE}/cert.pem"
  /usr/bin/openssl pkcs12 -export \
    -inkey "${work}/key.pem" -in "${work}/cert.pem" \
    -out "${work}/cert.p12" -name "$IDENTITY" -passout "pass:${PASS}"

  /usr/bin/security create-keychain -p "$PASS" "$KEYCHAIN"
  /usr/bin/security set-keychain-settings -lut 21600 "$KEYCHAIN"
  /usr/bin/security unlock-keychain -p "$PASS" "$KEYCHAIN"
  /usr/bin/security import "${work}/cert.p12" -k "$KEYCHAIN" -P "$PASS" \
    -f pkcs12 -T /usr/bin/codesign -T /usr/bin/security >/dev/null
  # Let codesign use the key from a script without a click-through dialog.
  /usr/bin/security set-key-partition-list -S apple-tool:,apple:,codesign: -s \
    -k "$PASS" "$KEYCHAIN" >/dev/null
  rm -rf "$work"
  trap - EXIT
fi

add_to_search_list "$KEYCHAIN"

# create-keychain on some macOS versions makes the new keychain the default.
# Put the previous default back. We never want the login keychain replaced.
previous_default="$(/bin/cat "${STATE}/default-keychain-before.txt")"
if [ -n "$previous_default" ] && [ "$(default_keychain)" != "$previous_default" ]; then
  /usr/bin/security default-keychain -s "$previous_default"
fi

if ! identity_ready; then
  echo "Identity \"${IDENTITY}\" was not created in ${KEYCHAIN}." >&2
  exit 1
fi

# Public description of the keychain change. No password.
{
  echo "identity=${IDENTITY}"
  echo "keychain=${KEYCHAIN}"
  echo "default_keychain_now=$(default_keychain)"
  echo "login_keychain_untouched=${LOGIN_KEYCHAIN}"
  echo "search_list_now:"
  list_keychains
} >"$MARKER"

echo "Local signing identity ready: ${IDENTITY}"
