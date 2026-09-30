# Dock interaction previews

`dock-attached-rail.mp4` uses the actual React dock and the existing test fixture. Voice and recorder events are demo data; desktop movement is staged to show the eight placement anchors. Native mouse-release snapping is implemented separately in `src-tauri/src/floating.rs` and must also be checked in the Mac app.

To recreate the video, run the Vite development server on port 1420, then run:

```sh
node scripts/render-dock-preview.mjs /absolute/path/dock-attached-rail.mp4
```

The renderer uses the repository's Playwright dependency and `/opt/homebrew/bin/ffmpeg`. It creates no real recording, microphone input, or saved user content.
