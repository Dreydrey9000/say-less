# Say Less roadmap

Ideas in priority order. Nothing here is built unless it says so.

## v0.12: first public release (in progress)

- Signed and notarized Mac installers, Windows installers, and download buttons on saylessvoice.com.

## v0.13: voice visuals (Drey, 2026-09-24)

- **Squiggle line:** a wavy line that moves with your voice, as an option next to the audio bars.
- **Talking avatar:** the mouth opens and closes with your voice volume. It's volume-driven, not word-matched lip-sync, because true lip-sync needs a second live model and that's too heavy for 8GB laptops.
- **Avatar builder:** styles (stick figure, person, animal), colors, and hats. Flat SVG only. It has to read at the 104px compact size and turn off with Reduce Motion.
- Builds on the existing companion, which already scales with the live mic level.

## v0.14: "Say less, stress less" (Luis + Drey, 2026-09-24)

Your dictation history becomes a private memory that tells you what you keep saying.

- **Recurring problems and ideas:** cluster everything you've dictated into buckets, like "you've complained about video export audio 27 times" or "you had this app idea on 9/17." Both problems and solutions.
- **Morning or weekly digest:** "Fix this first," based on what keeps coming up.
- **Local wiki:** a nightly export of transcripts into Obsidian-style markdown notes.
- **Ask Claude about it:** a local MCP server, so any AI tool can search your own history.
- **Open questions:**
  - Local model or bring-your-own-key for the clustering? Default local-first, since privacy is the product promise.
  - How long to keep history.
  - Opt-in only.
- Optional read-aloud with Kokoro, the free local voice model.
