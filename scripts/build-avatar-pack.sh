#!/usr/bin/env bash
# Builds the painted avatar pack the app ships (public/avatars/*.webp).
#
#   scripts/build-avatar-pack.sh            # masters -> public/avatars (256 + 128)
#   scripts/build-avatar-pack.sh RAW_DIR    # 1024px paintings -> masters, then the above
#
# The paintings were made once for this project (see docs/avatars/README.md).
# Only the cropped 512px masters are kept in git; the app never paints anything.
# Needs `cwebp` (brew install webp).
set -euo pipefail
cd "$(dirname "$0")/.."
command -v cwebp >/dev/null || { echo "cwebp not found: brew install webp" >&2; exit 1; }

masters=docs/avatars/masters
out=public/avatars
mkdir -p "$masters" "$out"

if [[ $# -gt 0 ]]; then
  raw=$1
  while IFS=$'\t' read -r id left top size; do
    [[ -z "$id" || "$id" == \#* ]] && continue
    [[ -f "$raw/$id.png" ]] || { echo "missing $raw/$id.png" >&2; exit 1; }
    cwebp -quiet -q 90 -crop "$left" "$top" "$size" "$size" -resize 512 512 \
      "$raw/$id.png" -o "$masters/$id.webp"
  done < docs/avatars/crops.tsv
fi

for master in "$masters"/*.webp; do
  id=$(basename "$master" .webp)
  cwebp -quiet -q 80 -m 6 -resize 256 256 "$master" -o "$out/$id-256.webp"
  cwebp -quiet -q 78 -m 6 -resize 128 128 "$master" -o "$out/$id-128.webp"
done
echo "pack: $(du -ck "$out"/*.webp | tail -1 | cut -f1) KB in $out"
