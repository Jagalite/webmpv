#!/usr/bin/env bash
# Candidate recipe. Two independent clean builds remain a qualification gate.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
SDK="$ROOT/build/emsdk-4.0.14"
test -f "$SDK/.emscripten"
# Existing link scripts share this config path; establish it for a fresh checkout.
if [ ! -f build/gap.emscripten ]; then cp "$SDK/.emscripten" build/gap.emscripten; fi
bash scripts/build.sh
npm run build:software-full
python3 experiments/retained-subtitles/compile-hook.py
npm run build:hybrid
npm run build:remux
npm run build
