#!/usr/bin/env bash
# Uploads the macOS signing + notarization secrets GitHub Actions needs.
# You only type two things: your Mac password (macOS dialog) and an Apple app-specific password.
# Nothing sensitive is printed; temp files live in a private folder that is deleted on exit.
set -euo pipefail
REPO="Dreydrey9000/say-less"
TEAM_ID_DEFAULT="NBPGY9GJFW"
TMP="$(mktemp -d)"; chmod 700 "$TMP"
trap 'rm -rf "$TMP"' EXIT

IDENTITY=$(security find-identity -v -p codesigning | grep -o '"Developer ID Application: [^"]*"' | head -1 | tr -d '"')
[ -n "$IDENTITY" ] || { echo "No 'Developer ID Application' certificate in your keychain. Create it in Xcode first."; exit 1; }
echo "Using: $IDENTITY"

echo
echo "Step 1 of 2: exporting the certificate."
echo "  macOS will ask for your Mac login password (maybe once per key). Click 'Allow' after typing it."
EXPORT_PW=$(openssl rand -hex 16)
security export -k "$HOME/Library/Keychains/login.keychain-db" -t identities -f pkcs12 -P "$EXPORT_PW" -o "$TMP/all.p12"

# The keychain export holds every signing identity; keep only the Developer ID one.
/usr/bin/openssl pkcs12 -in "$TMP/all.p12" -passin "pass:$EXPORT_PW" -nodes -out "$TMP/all.pem" 2>/dev/null
/usr/bin/python3 - "$TMP/all.pem" "$TMP" <<'PY'
import re, sys
pem, out = open(sys.argv[1]).read(), sys.argv[2]
blocks = re.findall(r'(Bag Attributes.*?-----END [A-Z ]+-----)', pem, re.S)
def kid(b):
    m = re.search(r'localKeyID: ([0-9A-F ]+)', b); return m.group(1).strip() if m else None
certs = [b for b in blocks if 'BEGIN CERTIFICATE' in b and 'Developer ID Application' in b]
if len(certs) != 1: sys.exit(f"expected 1 Developer ID cert, found {len(certs)}")
keys = [b for b in blocks if 'PRIVATE KEY' in b and kid(b) == kid(certs[0])]
if len(keys) != 1: sys.exit("matching private key not found")
body = lambda b: b[b.index('-----BEGIN'):]
open(f"{out}/cert.pem", "w").write(body(certs[0]) + "\n")
open(f"{out}/key.pem", "w").write(body(keys[0]) + "\n")
PY
P12_PW=$(openssl rand -hex 16)
/usr/bin/openssl pkcs12 -export -in "$TMP/cert.pem" -inkey "$TMP/key.pem" -name "$IDENTITY" -passout "pass:$P12_PW" -out "$TMP/devid.p12"
echo "  Exported only the Developer ID certificate."

echo
echo "Step 2 of 2: notarization login (Apple scans the app so Macs trust it)."
echo "  Make an app-specific password at https://account.apple.com > Sign-In and Security > App-Specific Passwords > +"
TEAM_ID="${APPLE_TEAM_ID:-$TEAM_ID_DEFAULT}"
echo "  Team ID: $TEAM_ID"
# Check the login with Apple before saving anything, so a typo fails here in
# seconds instead of at the end of a 30-minute release build.
# Easiest path: keep the login in ~/.secrets/say-less.env (made with
# `secret-file say-less APPLE_ID APPLE_APP_PASSWORD`), so nothing is typed here.
SECRETS_FILE="$HOME/.secrets/say-less.env"
if [ -f "$SECRETS_FILE" ]; then
  FILE_ID=$(grep -m1 '^APPLE_ID=' "$SECRETS_FILE" | cut -d= -f2- || true)
  FILE_PW=$(grep -m1 '^APPLE_APP_PASSWORD=' "$SECRETS_FILE" | cut -d= -f2- || true)
  [ -n "$FILE_ID" ] && [ -z "${APPLE_ID:-}" ] && APPLE_ID="$FILE_ID"
fi
APPLE_ID_PRESET="${APPLE_ID:-}"
for attempt in 1 2 3; do
  if [ -n "$APPLE_ID_PRESET" ]; then
    APPLE_ID="$APPLE_ID_PRESET"
    echo "  Apple ID: $APPLE_ID"
  else
    read -r -p "Apple ID email (the one that owns the developer account): " APPLE_ID
  fi
  if [ -n "${FILE_PW:-}" ] && [ "$attempt" = 1 ]; then
    APPLE_APP_PW="$FILE_PW"
    echo "  Using the password saved in $SECRETS_FILE"
  else
    read -r -s -p "App-specific password (paste, then Enter): " APPLE_APP_PW; echo
  fi
  APPLE_ID=$(printf '%s' "$APPLE_ID" | tr -d '[:space:]')
  APPLE_APP_PW=$(printf '%s' "$APPLE_APP_PW" | tr -d '[:space:]')
  echo "  Checking that login with Apple..."
  if CHECK_OUT=$(xcrun notarytool history --apple-id "$APPLE_ID" --password "$APPLE_APP_PW" \
      --team-id "$TEAM_ID" 2>&1); then
    echo "  Apple accepted it."
    break
  fi
  echo "  Apple said no: $(printf '%s' "$CHECK_OUT" | grep -m1 -i 'error' || printf '%s' "$CHECK_OUT" | tail -1)"
  echo "  (Password was ${#APPLE_APP_PW} characters. An app-specific password is 16 letters, shown as xxxx-xxxx-xxxx-xxxx.)"
  echo "  Make a fresh app-specific password, copy it, and paste it here."
  if [ "$attempt" = 3 ]; then echo "Nothing was saved."; exit 1; fi
done

echo
echo "Uploading to GitHub secrets for $REPO ..."
base64 -i "$TMP/devid.p12" | gh secret set APPLE_CERTIFICATE -R "$REPO"
printf '%s' "$P12_PW" | gh secret set APPLE_CERTIFICATE_PASSWORD -R "$REPO"
openssl rand -base64 24 | gh secret set KEYCHAIN_PASSWORD -R "$REPO"
printf '%s' "$APPLE_ID" | gh secret set APPLE_ID -R "$REPO"
printf '%s' "$APPLE_APP_PW" | gh secret set APPLE_PASSWORD -R "$REPO"
printf '%s' "$APPLE_APP_PW" | gh secret set APPLE_ID_PASSWORD -R "$REPO"
printf '%s' "$TEAM_ID" | gh secret set APPLE_TEAM_ID -R "$REPO"

echo
gh secret list -R "$REPO"
echo "Done. Tell Claude: signing is set."
