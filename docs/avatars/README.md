# Painted avatars

Say Less ships 16 painted avatars in `public/avatars/` (a 256px and a 128px WebP
of each, about 144 KB for the whole pack). They were painted once for this
project with image models, then cropped and compressed. The app never calls an
image service: the pictures are plain files, so they work offline for everyone.

## How they talk

Each painting has two bead eyes and no mouth. The app draws the same live SVG
mouth and eyelids the custom avatar uses on top of the painting, placed with the
anchor numbers in `src/lib/avatarPresets.ts` (a 100x100 box over the image).
The mouth follows your voice volume, the lids blink on a random timer, and both
hold still with Pause animations or Reduce Motion.

We also tried painting a closed-mouth frame and an open-mouth frame and fading
between them. `technique/technique-proof.jpg` shows both at 200, 104 and 40
pixels. The live mouth has every size in between, reads at 40px, and needs one
painting per character instead of two or three, so that is what ships.

## Style

`council/council-comparison.jpg` compares three styles (soft 3D clay, flat
illustration, animated film) from two painters, including how each reads at 104
and 40 pixels. We picked soft 3D clay: it reads at small sizes, and the clay
version was the only one that kept the lower face blank and the eyes simple,
which the live mouth and blinking lids need. Every avatar uses the same prompt
skeleton; the first seven were painted from text, the rest with a finished pack
avatar as a style reference. `pack-talking.jpg` shows the whole pack talking.

## Files

- `receipts/*.prompt.txt`: the prompt, the prompt the model received, and
  provenance for each painting (C2PA signer where the painter provides one).
- `crops.tsv`: the square crop taken from each 1024px painting.
- `masters/*.webp`: 512px cropped masters.
- `scripts/build-avatar-pack.sh`: rebuilds `public/avatars/` from the masters
  (or from new 1024px paintings plus `crops.tsv`). Needs `cwebp`.

To add a character: paint it with the prompt skeleton in any receipt, add a crop
line, run the script, add its id to `avatarPresets` (with anchors) and to
`AVATAR_PRESETS` in `src-tauri/src/studio.rs`, and add its name to the
translation files.

The paintings were generated for Say Less and are released with the app under
its MIT license.
