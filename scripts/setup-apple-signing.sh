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
read -r -p "Apple ID email: " APPLE_ID
read -r -s -p "App-specific password (paste, then Enter): " APPLE_APP_PW; echo
read -r -p "Team ID [$TEAM_ID_DEFAULT]: " TEAM_ID
TEAM_ID=${TEAM_ID:-$TEAM_ID_DEFAULT}

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
