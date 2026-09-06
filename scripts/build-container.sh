#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
OUTPUT=${1:-build/container-result}
mkdir -p "$OUTPUT"
OUTPUT=$(cd "$OUTPUT" && pwd)
docker build --platform linux/arm64 -t webmpv-m0-toolchain .
docker image inspect webmpv-m0-toolchain --format '{"id":"{{.Id}}","architecture":"{{.Architecture}}","os":"{{.Os}}"}' > "$OUTPUT/toolchain-image.json"
docker run --rm --platform linux/arm64 \
  --mount "type=bind,src=$ROOT,dst=/input,readonly" \
  --mount "type=bind,src=$OUTPUT,dst=/output" \
  webmpv-m0-toolchain bash /input/scripts/container-build.sh
