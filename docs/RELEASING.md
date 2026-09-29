# Shipping to users

Anyone with write access can do this. No admin needed: the Apple and updater
signing keys are repo secrets, so GitHub Actions signs the build for you.

## 1. Get your change into `main`

1. Push a branch and **open a pull request**. A pushed branch alone never ships.
2. One feature or fix per PR. Add a line to `CHANGELOG.md` if users will notice it.
3. Wait for checks to pass, then **Squash and merge**.

## 2. Cut a release (a PR of its own)

Bump the version in all of these, e.g. `0.14.6` to `0.14.7`:

- `package.json`
- `src-tauri/Cargo.toml` and `src-tauri/Cargo.lock` (the `say-less` entry)
- `src-tauri/tauri.conf.json`
- `site/index.html` (the download links)

Then add `src/content/release-notes/<version>.md`. That file is the in-app
"What's new" people see once after they update, so write it for users, not
developers. Copy the last one for the format. Add a `### Release` line to
`CHANGELOG.md`. Open the PR, merge it.

## 3. Build and publish

1. GitHub, **Actions**, **Release**, **Run workflow** on `main`.
2. It builds Mac and Windows, signs them, and makes a **draft** release
   (about 30 to 40 minutes).
3. Open **Releases**, check the draft has the `.dmg` files and `latest.json`,
   then **Publish**.

Publishing is the moment it goes live: the in-app updater reads
`latest.json` from the newest published release.

## 4. Check it

- The release page shows **Latest**.
- An older copy of Say Less offers **Update now** from the footer button.
