# Local builds without breaking the installed app

macOS remembers permissions (Accessibility, Screen Recording, Input Monitoring)
for **one exact build** of an app. `tauri build` signs local builds ad hoc, so
every build has a different identity. If a local build shares the installed
app's bundle id (`com.dreythomas.sayless`) and gets copied over
`/Applications/Say Less.app`, macOS keeps a stale permission row that looks on
but does not match the running app. Re-adding it does not help. That is the
"Accessibility: Allow, no matter how many times I add it" bug.

## Rules

1. Build test copies with `bun run build:local`. It makes **Say Less Dev**
   (`com.dreythomas.sayless.dev`): own settings, own permissions, never the
   installed app.
2. Never copy a local build into `/Applications`. Releases come from the GitHub
   **Release** workflow (signed and notarized), see `docs/RELEASING.md`.
3. If macOS knows about stray copies: `bash scripts/one-copy.sh` lists them,
   `bash scripts/one-copy.sh --fix` forgets them (files are not deleted).
4. If Accessibility is stuck anyway: `bash scripts/fix-permissions.sh`
   (you run it; it resets that one permission and reopens Settings).

## Stable local signature

`codesign -s -` (ad hoc) writes the build's cdhash into the designated
requirement. macOS then treats the next rebuild as a different app, and
Accessibility asks again even though System Settings still shows a switch.
`bun run build:local` signs **Say Less Dev** with a self-signed identity,
**Say Less Local Dev**, stored in its own keychain:

`~/Library/Keychains/say-less-local-dev.keychain-db`

That keychain is added to the user search list so `codesign` can see it. The
login keychain's contents are not changed. `security find-identity -p codesigning`
still prints `0 valid identities`: it only lists trusted Apple-issued
certificates. `codesign -dv` shows `Authority=Say Less Local Dev`, and two
builds print the same `codesign -dr -` line (the certificate leaf hash, not the
cdhash). Undo the keychain and the search-list entry with
`bash scripts/undo-local-signing.sh`. The next local build creates a new
certificate, and macOS asks for Accessibility once for that new identity.

## Known issues

- **Homebrew `xattr` breaks bundling.** `which xattr` printing `/opt/homebrew/bin/xattr`
  makes `tauri build` stop with "failed to run xattr". `scripts/local-build.sh`
  puts `/usr/bin` first for you.
- **Extra "Say Less" tiles in the Dock (macOS 27 beta).** Each window the app
  opens after its first (the recording pill, the rewrite preview, the floating
  dock) leaves one more tile, and the tiles stay after you quit. Same family as
  cjpais/Handy#2132. `bash scripts/clear-dock-ghosts.sh` removes them.
