#!/usr/bin/env bash
# Build all three engines from locked sources; see docs/RELEASE.md for a clean run.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
SDK=${WEBMPV_SDK:-$ROOT/build/emsdk-4.0.14}
mkdir -p build
# Standard candidate profile; experimental overrides are outside this recipe.
unset WEBMPV_REMUX_FFMPEG_DIR WEBMPV_ENGINE_DIR WEBMPV_LINK_OPT
export WEBMPV_BROWSER_DECODER=0
export WEBMPV_DECODER_SIMD=1
python3 scripts/beta-build-record.py start "$@"
python3 scripts/prepare-beta-toolchain.py --sdk "$SDK"
export WEBMPV_SDK="$SDK"
export WEBMPV_EM_CONFIG="$ROOT/build/beta.emscripten"
export EM_CONFIG="$WEBMPV_EM_CONFIG"
export WEBMPV_CACHE="$ROOT/build/cache"
export EM_CACHE="$WEBMPV_CACHE"
export PATH="$ROOT/build/venv/bin:$PATH"
export WEBMPV_MANIFEST_DIR=build/baseline-manifest
export WEBMPV_FULL_MANIFEST_DIR=build/software-full-manifest
mkdir -p "$WEBMPV_MANIFEST_DIR"
bash scripts/build.sh
bash scripts/build-playback-deps.sh
npm run build:software-full
python3 experiments/retained-subtitles/compile-hook.py
npm run build:hybrid
npm run build:remux
npm run build
python3 scripts/beta-build-record.py finish
