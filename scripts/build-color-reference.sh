#!/usr/bin/env bash
# Host-only reference used by compatibility color tests, never shipped.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
mkdir -p build/native-color-reference
cd build/native-color-reference
../../build/sources/ffmpeg/configure --disable-everything --disable-autodetect \
 --disable-doc --disable-debug --disable-x86asm --disable-ffprobe \
 --enable-ffmpeg --enable-demuxer=matroska --enable-decoder=ffv1 \
 --enable-filter=zscale,format,tonemap,scale,null,buffer,buffersink --enable-libzimg \
 --enable-protocol=file --enable-muxer=rawvideo --enable-encoder=rawvideo
make -j "${WEBMPV_JOBS:-4}"
