#!/usr/bin/env bash
# Uploads the macOS signing + notarization secrets GitHub Actions needs.
# You type every password yourself; nothing is printed or saved to disk except a temp .p12 that is deleted.
set -euo pipefail
REPO="Dreydrey9000/say-less"

echo "Step 1 of 4: Developer ID Application certificate"
echo "  If you don't have one yet: Xcode > Settings > Accounts > your Apple ID > Manage Certificates > + > Developer ID Application."
echo "  (Only the Apple Developer account holder can create it.)"
echo
security find-identity -v -p codesigning | grep "Developer ID Application" || {
  echo "No 'Developer ID Application' certificate found in your keychain. Create it (above), then rerun this script."; exit 1; }
read -r -p "Press Enter once the certificate above is the one to use..."

echo
echo "Step 2 of 4: export it"
echo "  Keychain Access will open. Find 'Developer ID Application: ...' under My Certificates,"
echo "  right-click > Export > save as ~/Downloads/say-less-devid.p12 and pick an export password."
open -a "Keychain Access"
P12="$HOME/Downloads/say-less-devid.p12"
until [ -f "$P12" ]; do read -r -p "Waiting for $P12 ... press Enter after exporting "; done
read -r -s -p "Export password you just chose: " P12_PW; echo

echo
echo "Step 3 of 4: notarization login (Apple scans the app so Macs trust it)"
echo "  Make an app-specific password at https://account.apple.com > Sign-In and Security > App-Specific Passwords."
read -r -p "Apple ID email: " APPLE_ID
read -r -s -p "App-specific password: " APPLE_APP_PW; echo
echo "  Team ID is the 10-character code in your certificate name (Developer ID Application: NAME (TEAMID))."
read -r -p "Team ID [NBPGY9GJFW]: " TEAM_ID
TEAM_ID=${TEAM_ID:-NBPGY9GJFW}

echo
echo "Step 4 of 4: uploading to GitHub secrets for $REPO"
base64 -i "$P12" | gh secret set APPLE_CERTIFICATE -R "$REPO"
printf '%s' "$P12_PW" | gh secret set APPLE_CERTIFICATE_PASSWORD -R "$REPO"
openssl rand -base64 24 | gh secret set KEYCHAIN_PASSWORD -R "$REPO"
printf '%s' "$APPLE_ID" | gh secret set APPLE_ID -R "$REPO"
printf '%s' "$APPLE_APP_PW" | gh secret set APPLE_PASSWORD -R "$REPO"
printf '%s' "$APPLE_APP_PW" | gh secret set APPLE_ID_PASSWORD -R "$REPO"
printf '%s' "$TEAM_ID" | gh secret set APPLE_TEAM_ID -R "$REPO"
rm -P "$P12" 2>/dev/null || rm -f "$P12"

echo
gh secret list -R "$REPO"
echo "Done. The next release build will be signed and notarized. Tell Claude 'signing is set'."
