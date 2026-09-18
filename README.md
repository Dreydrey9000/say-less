# Say Less

Free, offline push-to-talk dictation for Mac and Windows. Hold a key, talk, and your words get typed into whatever app you're in.

- **Free.** No subscription, no account.
- **Private.** Speech is turned into text on your own computer. Nothing is sent anywhere.
- **Light.** Built to run on laptops with 8GB of RAM.

## Install
Download the latest installer from [Releases](https://github.com/Dreydrey9000/say-less/releases):
- **Mac:** the `.dmg` (`aarch64` = Apple Silicon M1/M2/M3/M4, `x64` = older Intel Macs)
- **Windows:** the `x64-setup.exe`

On first launch, allow **Microphone** and **Accessibility** access. Accessibility lets Say Less type for you.

**Recommended model for 8GB machines:** Parakeet V3 (fast on any CPU) or Whisper Small (better with accents and other languages).

## Build from source
Requires [Rust](https://rustup.rs) and [Bun](https://bun.sh).
```bash
bun install
bun run tauri dev      # run locally
bun run tauri build    # make an installer for this OS
```

## Credits
Say Less is a rebranded fork of [Handy](https://github.com/cjpais/Handy) by CJ Pais, used under the MIT License (see `LICENSE`). Upstream docs: `UPSTREAM-HANDY-README.md`.
To pull upstream fixes: `git fetch upstream && git merge upstream/main`.
