#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build/reference-fonts results/m2
cp fixtures/DejaVuSans.ttf build/reference-fonts/
mpv --version > results/m2/subtitle-reference-version.txt
mpv --no-config --vo=image --ao=null --start=5 --frames=1 --sid=2 \
  --sub-ass-override=no --sub-fonts-dir=build/reference-fonts \
  --vo-image-format=png --vo-image-high-bit-depth=no \
  --vo-image-outdir=build/reference-on build/fixtures/tracks.mkv
mpv --no-config --vo=image --ao=null --start=5 --frames=1 --sid=no \
  --vo-image-format=png --vo-image-high-bit-depth=no \
  --vo-image-outdir=build/reference-off build/fixtures/tracks.mkv
python3 - <<'PY'
from pathlib import Path
Path('build/fixtures/over-budget-font.ttf').write_bytes(bytes(5*1024*1024))
PY
ffmpeg -hide_banner -y -i fixtures/m0.mkv -map 0:v -map 0:a -map 0:s -c copy \
  -attach build/fixtures/over-budget-font.ttf \
  -metadata:s:t mimetype=application/x-truetype-font build/fixtures/over-budget.mkv

cp build/reference-on/00000001.png results/m2/ass-reference-on.png
cp build/reference-off/00000001.png results/m2/ass-reference-off.png

for state in on off; do
  sid=no
  if [ "$state" = on ]; then sid=2; fi
  mpv --no-config --vo=image --ao=null --start=5 --frames=1 --sid="$sid" \
    --sub-ass-override=no --sub-fonts-dir=build/reference-fonts \
    --vf=lavfi='[scale=1280:720:flags=bilinear]' \
    --vo-image-format=png --vo-image-high-bit-depth=no \
    --vo-image-outdir="build/reference-720-$state" build/fixtures/tracks.mkv
  cp "build/reference-720-$state/00000001.png" "results/m2/ass-reference-720-$state.png"
done

for reference_phase in 225 325; do
  reference_time=2.25
  if [ "$reference_phase" = 325 ]; then reference_time=3.25; fi
  for reference_state in on off; do
    reference_sid=no
    if [ "$reference_state" = on ]; then reference_sid=2; fi
    mpv --no-config --vo=image --ao=null --start="$reference_time" --frames=1 \
      --sid="$reference_sid" --sub-ass-override=no --sub-fonts-dir=build/reference-fonts \
      --vo-image-format=png --vo-image-high-bit-depth=no \
      --vo-image-outdir="build/reference-karaoke-$reference_phase-$reference_state" \
      build/fixtures/tracks.mkv
    cp "build/reference-karaoke-$reference_phase-$reference_state/00000001.png" \
      "results/m2/karaoke-reference-$reference_phase-$reference_state.png"
  done
done
