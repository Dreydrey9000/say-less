# Say Less

![Say Less emblem](public/brand/say-less-emblem.png)

[Brand assets and coaching-portal usage](docs/brand.md)

Open **Writing** for personal vocabulary, filler cleanup, and local voice snippets. Save a cue such as “my booking link,” then use the preview to check its exact expansion. [Wispr Flow capability comparison and remaining gaps](docs/wispr-comparison.md) · [UI verification standard](docs/UI-STANDARD.md).

Free, offline push-to-talk dictation for Mac and Windows. Hold a key, talk, and your words get typed into whatever app you're in.

- **Free.** No subscription, no account.
- **Private dictation.** Speech recognition runs on your computer. Optional cloud post-processing sends the transcript to the provider you configure; leave it off for fully local dictation.
- **Light.** Built to run on laptops with 8GB of RAM.

## Install

Installer releases are not published yet (checked September 22, 2026). Build locally using the instructions below. When installers are available, they will appear in [Releases](https://github.com/Dreydrey9000/say-less/releases):

- **Mac:** the `.dmg` (`aarch64` = Apple Silicon M1/M2/M3/M4, `x64` = older Intel Macs)
- **Windows:** the `x64-setup.exe`

On first launch, allow **Microphone** and **Accessibility** access. Accessibility lets Say Less type for you.

## Try Nemotron locally

In **Models**, search for **Nemotron Streaming 3.5**, download it, and select it. The default Q8 model is approximately 751 MB. Model download requires internet; speech recognition works offline after download. Enable the live preview overlay to see partial text while speaking, then release the shortcut to finish and paste.

Nemotron is optional. Keep your existing Parakeet or Whisper model available so you can switch back in Models. Performance on an 8GB machine has not yet been measured for this fork.

See [Nemotron verification and troubleshooting](docs/nemotron.md) and the [dictation architecture](docs/diagrams/dictation.svg) ([editable Mermaid source](docs/diagrams/dictation.mmd)). The runtime and model catalog already include Nemotron support inherited from Handy; no external voice service or Python server is required.

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

## Personalize and migrate

See [appearance, floating dock, voice actions, and Wispr import](docs/personalization.md). The [editable architecture diagram](docs/diagrams/personalization.mmd) shows local storage and action boundaries ([rendered version](docs/diagrams/personalization.svg)).
