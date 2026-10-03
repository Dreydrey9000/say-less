import { existsSync } from "node:fs";

// Frontend previews don't need the native helper. A Mac installer must never
// silently ship a Studio button without its self-contained runtime.
if (
  process.platform === "darwin" &&
  !existsSync("src-tauri/resources/studio-runtime/say-less-studio")
) {
  throw new Error(
    "Build Studio first: python3 -m pip install PyInstaller==6.22.3, then python3 scripts/build-studio-runtime.py",
  );
}
