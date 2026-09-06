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
