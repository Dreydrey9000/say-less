# Say Less Bridge (optional companion)

A small Python service that gives Say Less three cloud powers the desktop app
doesn't have yet. It runs beside the app (launchd), talks to the app only
through the filesystem and clipboard, and changes nothing in the app binary.
Think of it as the staging ground for features that may move into the app
proper later.

## What it does

1. **Cloud offload for screen recordings.** Watches `~/Movies/Say Less`;
   every new MP4 is uploaded to Backblaze B2 (primary), mirrored to Google
   Drive, and registered — with playable links — in `state/recordings.json`
   for any agent or script to read. Local cleanup after upload is optional
   (`delete_local_after_upload`).
2. **Title Box Ideas.** `title-ideas` captures the screen, sends it to a
   vision model (Antigravity CLI by default, Z.ai / Groq as fallbacks),
   grounds the suggestions in proven hooks for the client you name, and puts
   6 styles × 10 options on your clipboard in ~90 seconds.
3. **Image library.** Generated images land in `~/Pictures/Say Less Images`
   (by month), on your clipboard, and in B2 + Drive, registered in
   `state/images.json`.

## Run it

```bash
python3 bridge/bridge.py            # serves 127.0.0.1 (port in state/port.txt)
```

Or install the LaunchAgent from `extras/`. CLIs (also in this folder, add to
PATH): `title-ideas`, `images`, `recordings`, `bridge-bucket <bucket>`
(switch the B2 bucket; current default `luis-personal`).

## HTTP API

`GET /health` · `GET /recordings` · `GET /images` · `POST /upload {path}` ·
`POST /ideas {image_path?, client?, count?, extra?}` ·
`POST /image-register {path, prompt, painter}`

## Configuration

Copy `config.example.json` → `config.json`. Credentials are read at runtime
from env files you point it at (B2 key, Z.ai/Groq keys) — **no secrets live
in this repo**. `state/` is runtime-only (registries, logs, port file).

## Extras

- `extras/com.user.say-less-bridge.plist` — LaunchAgent (edit the username).
- `extras/hammerspoon-init.lua` — global hotkeys for the four companion
  launcher apps (Title Ideas / Say Less Image / Say Less Recordings /
  Read Screens) built from these scripts.

## Roadmap toward the app

- Native (Rust) B2/Drive upload in the recording save path — no watcher.
- A Title Ideas card reusing the app's own capture + the bridge endpoint.
- The dock buttons already render configured voice actions (shipped in
  v0.14.6); the bridge endpoints are the natural next backend for them.

Tested end-to-end on macOS 26.1 / M1 Pro: 59 s and 2 h15 m recordings
uploaded 74 s after stop, links verified (HTTP 206), title ideas generated
live from a CapCut session.
